import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpClient, AccessError } from "../src/scraper/http.js";
import {
  normalizeComic,
  normalizeChapter,
  normalizePages,
  ShinigamiScraper,
  stableId,
} from "../src/scraper/shinigami.js";
import { bundleSchema } from "../src/data/schema.js";
import { loadCheckpoint, readDataset, saveDataset } from "../src/data/files.js";
import {
  at,
  chapterId2,
  comicId,
  detail,
  fixtureBundle,
  source,
  sourceChapter,
} from "./fixtures.js";

function json(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

test("normalization preserves decimal chapters, source identity, unicode titles, and page order", () => {
  const comic = normalizeComic({ ...source, title: "한국어" }, at);
  assert.equal(comic.release_year, 2026);
  assert.match(comic.slug, new RegExp(comicId));
  assert.equal(stableId("comic", comicId), comic.id);
  assert.notEqual(stableId("chapter", comicId), comic.id);
  const chapter = normalizeChapter(sourceChapter, comic, at);
  assert.equal(chapter.number, 0.5);
  const reader = normalizePages(detail, chapter, comicId, at);
  assert.deepEqual(
    reader.pages?.map((page) => page.position),
    [1, 2],
  );
  assert.equal(
    reader.pages?.[0]?.image_url,
    "https://assets.shngm.id/chapter/example/1.webp",
  );
  assert.equal(
    normalizeComic({ ...source, release_year: "unknown" }, at).release_year,
    null,
  );
});

test("wrong parents, empty manifests, foreign hosts, and malformed page order fail validation", () => {
  const bundle = fixtureBundle();
  const chapter = bundle.chapters[0]!;
  assert.throws(() =>
    normalizeChapter(
      { ...sourceChapter, manga_id: chapterId2 },
      bundle.comic,
      at,
    ),
  );
  assert.throws(() =>
    normalizePages({ ...detail, chapter_id: chapterId2 }, chapter, comicId, at),
  );
  assert.throws(() =>
    normalizePages(
      { ...detail, base_url: "https://example.org" },
      chapter,
      comicId,
      at,
    ),
  );
  assert.throws(() =>
    normalizePages(
      { ...detail, chapter: { path: "//example.org/", data: ["1.webp"] } },
      chapter,
      comicId,
      at,
    ),
  );
  assert.throws(() =>
    normalizePages(
      { ...detail, chapter: { path: "/chapter/", data: [] } },
      chapter,
      comicId,
      at,
    ),
  );
  assert.throws(() =>
    bundleSchema.parse({
      ...bundle,
      chapters: [
        {
          ...chapter,
          pages: [{ position: 2, image_url: "https://assets.shngm.id/2.webp" }],
        },
      ],
    }),
  );
  assert.throws(() =>
    bundleSchema.parse({ ...bundle, chapters: [chapter, chapter] }),
  );
});

test("chapter pagination deduplicates and marks capped lists incomplete", async () => {
  const requests: string[] = [];
  const http = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async (input) => {
      const url = new URL(String(input));
      requests.push(url.pathname + url.search);
      if (url.pathname === "/robots.txt")
        return new Response("", { status: 404 });
      if (url.pathname.includes("manga/detail"))
        return json({ retcode: 0, data: source });
      if (url.pathname.includes("chapter/detail"))
        return json({ retcode: 0, data: detail });
      const page = Number(url.searchParams.get("page"));
      return json({
        retcode: 0,
        meta: { page, total_page: 2, total_record: 2 },
        data:
          page === 1
            ? [sourceChapter]
            : [
                sourceChapter,
                { ...sourceChapter, chapter_id: chapterId2, chapter_number: 1 },
              ],
      });
    },
  });
  const scraper = new ShinigamiScraper(http);
  const partial = await scraper.comic(comicId, {
    chapterPages: 1,
    readerChapters: 0,
    pageSize: 1,
  });
  assert.equal(partial.chapter_list_complete, false);
  const complete = await scraper.comic(comicId, {
    chapterPages: 2,
    readerChapters: 1,
    pageSize: 1,
  });
  assert.equal(complete.chapter_list_complete, true);
  assert.equal(complete.chapters.length, 2);
  assert.equal(complete.chapters[0]?.pages?.length, 2);
  assert.equal(complete.chapters[1]?.pages, null);
  assert.equal(requests.filter((path) => path === "/robots.txt").length, 1);
});

test("403 and robots prohibitions stop without retries or protected requests", async () => {
  let calls = 0;
  const denied = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async () => {
      calls++;
      return new Response("Forbidden", { status: 403 });
    },
  });
  await assert.rejects(
    denied.json("https://api.shngm.io/v1/manga/list"),
    AccessError,
  );
  assert.equal(calls, 1);
  calls = 0;
  const robots = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async () => {
      calls++;
      return new Response("User-agent: *\nDisallow: /v1/\n");
    },
  });
  await assert.rejects(
    robots.json("https://api.shngm.io/v1/manga/list"),
    AccessError,
  );
  assert.equal(calls, 1);
});

test("429 respects Retry-After and HTML challenges are rejected", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const http = new HttpClient({
    delayMs: 0,
    log: () => {},
    wait: async (ms) => {
      waits.push(ms);
    },
    fetcher: async (input) => {
      if (String(input).endsWith("robots.txt"))
        return new Response("", { status: 404 });
      attempts++;
      return attempts === 1
        ? new Response("", { status: 429, headers: { "retry-after": "2" } })
        : json({ ok: true });
    },
  });
  assert.deepEqual(await http.json("https://api.shngm.io/v1/manga/list"), {
    ok: true,
  });
  assert.ok(waits.includes(2000));
  const challenge = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async (input) =>
      String(input).endsWith("robots.txt")
        ? new Response("", { status: 404 })
        : new Response("<html>challenge</html>", {
            headers: { "content-type": "text/html" },
          }),
  });
  await assert.rejects(
    challenge.json("https://api.shngm.io/v1/manga/list"),
    AccessError,
  );
});

test("atomic checkpoint roundtrip validates input and rejects corrupt files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "komik-test-"));
  try {
    const file = join(dir, "catalog.json");
    const dataset = await loadCheckpoint(file);
    dataset.bundles.push(fixtureBundle());
    await saveDataset(file, dataset);
    assert.deepEqual(await readDataset(file), dataset);
    await assert.rejects(
      saveDataset(file, {
        ...dataset,
        bundles: [...dataset.bundles, ...dataset.bundles],
      }),
    );
    assert.deepEqual(await readDataset(file), dataset);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("truncated response bodies retry without losing the catalog request", async () => {
  let attempts = 0;
  const http = new HttpClient({
    delayMs: 0,
    log: () => {},
    wait: async () => {},
    fetcher: async (input) => {
      if (String(input).endsWith("robots.txt"))
        return new Response("", { status: 404 });
      attempts++;
      if (attempts === 1)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("terminated"));
            },
          }),
          { headers: { "content-type": "application/json" } },
        );
      return json({ ok: true });
    },
  });
  assert.deepEqual(await http.json("https://api.shngm.io/v1/manga/list"), {
    ok: true,
  });
  assert.equal(attempts, 2);
});

test("persistent rate limits, redirect responses, and robots challenges stop requests", async () => {
  let attempts = 0;
  const limited = new HttpClient({
    delayMs: 0,
    log: () => {},
    wait: async () => {},
    fetcher: async (input) => {
      if (String(input).endsWith("robots.txt"))
        return new Response("", { status: 404 });
      attempts++;
      return new Response("", { status: 429, headers: { "retry-after": "0" } });
    },
  });
  await assert.rejects(
    limited.json("https://api.shngm.io/v1/manga/list"),
    AccessError,
  );
  assert.equal(attempts, 3);
  attempts = 0;
  const redirected = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async (_input, init) => {
      attempts++;
      assert.equal(init?.redirect, "manual");
      return new Response("", {
        status: 302,
        headers: { location: "https://example.org" },
      });
    },
  });
  await assert.rejects(
    redirected.json("https://api.shngm.io/v1/manga/list"),
    /302/,
  );
  assert.equal(attempts, 1);
  const challenged = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async () =>
      new Response("<!doctype html><html>Checking your browser</html>"),
  });
  await assert.rejects(
    challenged.json("https://api.shngm.io/v1/manga/list"),
    AccessError,
  );
  attempts = 0;
  const cooldown = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async (input) => {
      if (String(input).endsWith("robots.txt"))
        return new Response("", { status: 404 });
      attempts++;
      return new Response("", {
        status: 429,
        headers: { "retry-after": "3600" },
      });
    },
  });
  await assert.rejects(
    cooldown.json("https://api.shngm.io/v1/manga/list"),
    AccessError,
  );
  assert.equal(attempts, 1);
});
