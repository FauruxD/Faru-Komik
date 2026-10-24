import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { authorizedScraper } from "../src/cloud/authorization";
import { processCloudWork } from "../src/cloud/engine";
import type { CloudStore, Cursor } from "../src/cloud/model";
import { bundleSchema, type ComicBundle } from "../src/data/schema";
import { HttpClient } from "../src/scraper/http";
import { ShinigamiScraper } from "../src/scraper/shinigami";
import { fixtureBundle, sourceChapter, source, detail } from "./fixtures";

test("cloud controls fail closed without an exact long bearer secret", () => {
  const secret = "a".repeat(40);
  assert.equal(
    authorizedScraper(new Request("https://example.test"), secret),
    false,
  );
  assert.equal(
    authorizedScraper(
      new Request("https://example.test", {
        headers: { authorization: `Bearer ${secret}` },
      }),
      secret,
    ),
    true,
  );
  assert.equal(
    authorizedScraper(
      new Request("https://example.test", {
        headers: { authorization: `Bearer ${secret}x` },
      }),
      secret,
    ),
    false,
  );
  assert.equal(
    authorizedScraper(
      new Request("https://example.test", {
        headers: { authorization: "Bearer short" },
      }),
      "short",
    ),
    false,
  );
});

test("cloud steps checkpoint manifests individually and never require local files", async () => {
  const fixture = fixtureBundle();
  const pending = {
    ...fixture.chapters[0]!,
    pages: null,
    pages_fetched_at: null,
  };
  const saved: ComicBundle[] = [];
  const cursors: Cursor[] = [];
  const store: CloudStore = {
    async comics() {
      return [{ comic: fixture.comic, complete: true }];
    },
    async pendingComic() {
      return null;
    },
    async pendingChapters() {
      return saved.length ? [] : [pending];
    },
    async commit(cursor, bundles) {
      bundles.forEach((b) => saved.push(bundleSchema.parse(b)));
      cursors.push(cursor);
    },
  };
  const urls: string[] = [];
  const scraper = new ShinigamiScraper(
    new HttpClient({
      delayMs: 0,
      wait: async () => {},
      log: () => {},
      fetcher: async (input) => {
        const url = new URL(String(input));
        urls.push(url.pathname);
        if (url.pathname === "/robots.txt")
          return new Response("", { status: 404 });
        return Response.json({ retcode: 0, data: detail });
      },
    }),
  );
  assert.equal(
    (await processCloudWork(store, scraper, { phase: "pages" })).done,
    false,
  );
  assert.equal(saved[0]?.chapters[0]?.pages?.length, 2);
  assert.equal(saved[0]?.chapter_list_complete, true);
  assert.equal(
    urls.filter((url) => url.startsWith("/v1/chapter/detail/")).length,
    1,
  );
  assert.equal(
    (await processCloudWork(store, scraper, { phase: "pages" })).done,
    true,
  );
});

test("cloud catalog checks the API origin and preserves existing complete chapter lists", async () => {
  const fixture = fixtureBundle();
  const saved: ComicBundle[] = [];
  const cursors: Cursor[] = [];
  const urls: string[] = [];
  const store: CloudStore = {
    async comics() {
      return [{ comic: fixture.comic, complete: true }];
    },
    async pendingComic() {
      throw new Error("Chapter queue must wait for catalog completion");
    },
    async pendingChapters() {
      throw new Error("Reader queue must wait for catalog completion");
    },
    async commit(cursor, bundles) {
      saved.push(...bundles.map((bundle) => bundleSchema.parse(bundle)));
      cursors.push(cursor);
    },
  };
  const scraper = new ShinigamiScraper(
    new HttpClient({
      delayMs: 0,
      log: () => {},
      fetcher: async (input) => {
        const url = new URL(String(input));
        urls.push(url.href);
        assert.equal(url.origin, "https://api.shngm.io");
        if (url.pathname === "/robots.txt")
          return new Response("", { status: 404 });
        return Response.json({
          retcode: 0,
          data: [source],
          meta: { page: 1, total_page: 1, total_record: 1 },
          facet: { "taxonomy.Format.name": { Manhwa: 1 } },
        });
      },
    }),
  );
  await processCloudWork(store, scraper, { phase: "catalog" });
  assert.equal(urls[0], "https://api.shngm.io/robots.txt");
  assert.equal(urls.length, 2);
  assert.equal(saved.length, 1);
  assert.equal(saved[0]?.chapter_list_complete, true);
  assert.deepEqual(saved[0]?.chapters, []);
  assert.deepEqual(cursors.at(-1), {
    phase: "chapters",
    comicId: null,
    page: 1,
    seen: [],
  });
});

test("chapter-page extraction resumes at the requested page", async () => {
  const fixture = fixtureBundle();
  const urls: string[] = [];
  const scraper = new ShinigamiScraper(
    new HttpClient({
      delayMs: 0,
      wait: async () => {},
      log: () => {},
      fetcher: async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/robots.txt")
          return new Response("", { status: 404 });
        urls.push(url.searchParams.get("page") ?? "");
        return Response.json({
          retcode: 0,
          data: [sourceChapter],
          meta: { page: 3, total_page: 3, total_record: 3 },
        });
      },
    }),
  );
  const page = await scraper.chapterPage(fixture.comic, 3);
  assert.deepEqual(urls, ["3"]);
  assert.equal(page.chapters[0]?.source_chapter_id, sourceChapter.chapter_id);
});

test("accumulated discovery results never exceed the database transaction limit", async () => {
  const items = Array.from({ length: 200 }, (_, index) => ({
    ...source,
    manga_id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
  }));
  const batches: number[] = [];
  const saved = new Set<string>();
  const store: CloudStore = {
    async comics() {
      return [];
    },
    async pendingComic() {
      return null;
    },
    async pendingChapters() {
      return [];
    },
    async commit(_cursor, bundles) {
      if (bundles.length) batches.push(bundles.length);
      assert.ok(bundles.length <= 100);
      bundles.forEach((bundle) => saved.add(bundle.comic.id));
    },
  };
  const scraper = new ShinigamiScraper(
    new HttpClient({
      delayMs: 0,
      log: () => {},
      fetcher: async (input) => {
        const url = new URL(String(input));
        if (url.pathname === "/robots.txt")
          return new Response("", { status: 404 });
        return Response.json({
          retcode: 0,
          data: url.searchParams.has("format")
            ? items.slice(100)
            : items.slice(0, 100),
          meta: { page: 1, total_page: 2, total_record: 200 },
          facet: { "taxonomy.Format.name": { Manhwa: 200 } },
        });
      },
    }),
  );
  await processCloudWork(store, scraper, { phase: "catalog" });
  assert.deepEqual(batches, [100, 100]);
  assert.equal(saved.size, 200);
});

test("cloud database lease, atomic checkpoints, resume fencing, and public denial", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610230001_catalog.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261024034453_cloud_scraper.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec("set role service_role");
    const started = (
      await db.query<{
        value: { launch: boolean; job: { generation: string } };
      }>("select scrape_control('begin') as value")
    ).rows[0]!.value;
    assert.equal(started.launch, true);
    const generation = started.job.generation,
      owner = randomUUID();
    const claim = async (token: string) =>
      (
        await db.query<{ value: { kind: string } }>(
          "select claim_scrape_batch($1,$2,'wrun_test') as value",
          [generation, token],
        )
      ).rows[0]!.value;
    assert.equal((await claim(owner)).kind, "claimed");
    assert.equal((await claim(randomUUID())).kind, "wait");
    const bundle = fixtureBundle();
    const commit = (g: string, b: ComicBundle) =>
      db.query(
        'select commit_scrape_batch($1,$2,\'{"phase":"pages"}\'::jsonb,$3::jsonb,false)',
        [g, owner, JSON.stringify([b])],
      );
    await commit(generation, bundle);
    await commit(generation, bundle);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from chapter_pages",
        )
      ).rows[0]?.n,
      2,
    );
    const invalid = structuredClone(bundle);
    invalid.chapters[0]!.pages![1]!.position = 4;
    await assert.rejects(commit(generation, invalid), /contiguous/);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from chapter_pages",
        )
      ).rows[0]?.n,
      2,
    );
    await db.query("select scrape_control('pause')");
    await assert.rejects(commit(generation, bundle), /lease lost/);
    const resumed = (
      await db.query<{ value: { job: { generation: string } } }>(
        "select scrape_control('resume') as value",
      )
    ).rows[0]!.value;
    assert.notEqual(resumed.job.generation, generation);
    await assert.rejects(commit(resumed.job.generation, bundle), /lease lost/);
    await db.exec("reset role;set role anon");
    await assert.rejects(
      db.query("select * from scrape_jobs"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select scrape_control('resume')"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select claim_scrape_batch($1,$2,'test')", [generation, owner]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
