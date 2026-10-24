import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FullStore } from "../src/data/full-store.js";
import { discoverCatalog } from "../src/scraper/catalog.js";
import { HttpClient } from "../src/scraper/http.js";
import { ShinigamiScraper } from "../src/scraper/shinigami.js";
import { chapterId2, fixtureBundle, source } from "./fixtures.js";

test("full discovery retrieves both sorted result windows and checks facet totals", async () => {
  const orders: string[] = [];
  const alternative = {
    ...source,
    manga_id: chapterId2,
    title: "Second comic",
  };
  const http = new HttpClient({
    delayMs: 0,
    log: () => {},
    fetcher: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === "/robots.txt")
        return new Response("", { status: 404 });
      const order = url.searchParams.get("sort_order") ?? "desc";
      orders.push(order);
      return new Response(
        JSON.stringify({
          retcode: 0,
          meta: { page: 1, total_page: 1, total_record: 1 },
          data: [order === "asc" ? alternative : source],
          facet: { "taxonomy.Format.name": { Manhwa: 2 } },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const snapshots: number[] = [];
  const result = await discoverCatalog(
    new ShinigamiScraper(http),
    async (comics) => {
      snapshots.push(comics.length);
    },
  );
  assert.equal(result.complete, true);
  assert.equal(result.comics.length, 2);
  assert.deepEqual(result.observed_by_format, { Manhwa: 2 });
  assert.deepEqual(orders, ["desc", "desc", "asc"]);
  assert.deepEqual(snapshots, [1, 2]);
});

test("full archive checkpoints readers individually, hydrates for import, and locks concurrent workers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "komik-full-test-"));
  try {
    const store = new FullStore(dir);
    const unlock = await store.lock();
    await assert.rejects(store.lock(), /EEXIST/);
    await unlock();
    const unlockAgain = await store.lock();
    await unlockAgain();
    const fixture = fixtureBundle();
    const chapter = fixture.chapters[0]!;
    const metadata = {
      ...fixture,
      chapters: [{ ...chapter, pages: null, pages_fetched_at: null }],
    };
    await store.saveCatalog([fixture.comic]);
    await store.saveBundle(metadata);
    assert.equal(await store.chapter(chapter), null);
    await store.saveChapter(chapter);
    assert.equal((await store.catalog()).bundles.length, 1);
    const restored = await store.hydrate((await store.bundle(fixture.comic))!);
    assert.deepEqual(restored, fixture);
    const readerFiles = await store.readerFiles();
    assert.deepEqual([...readerFiles], [`${chapter.id}.json`]);
    const readChapter = store.chapter.bind(store);
    let readerFileReads = 0;
    store.chapter = async (candidate) => {
      readerFileReads++;
      return readChapter(candidate);
    };
    assert.deepEqual(await store.hydrate(metadata, new Set()), metadata);
    assert.equal(readerFileReads, 0);
    assert.deepEqual(await store.hydrate(metadata, readerFiles), fixture);
    assert.equal(readerFileReads, 1);
    assert.equal(
      JSON.parse(
        await readFile(join(dir, "comics", `${fixture.comic.id}.json`), "utf8"),
      ).chapters[0].pages,
      null,
    );
    await assert.rejects(
      store.saveChapter({ ...chapter, pages: null, pages_fetched_at: null }),
      /unfetched/,
    );
    await assert.rejects(
      store.chapter({ ...chapter, comic_id: chapterId2 }),
      /mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
