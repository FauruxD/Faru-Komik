import { bundleSchema, type Comic } from "../data/schema";
import { discoverCatalog } from "../scraper/catalog";
import { type ShinigamiScraper } from "../scraper/shinigami";
import type { CloudStore, Cursor } from "./model";

// Does not use local files. Only the Vercel step calls this with a live client;
// tests inject fixtures and never contact the source from this computer.
export async function processCloudWork(
  store: CloudStore,
  scraper: ShinigamiScraper,
  cursor: Cursor,
) {
  if (cursor.phase === "catalog") {
    const imported = new Set<string>();
    const saveCatalog = async (comics: Comic[], requests = 0) => {
      const fresh = comics.filter((comic) => !imported.has(comic.id));
      // Discovery callbacks include the accumulated catalog, not only the most
      // recent API page. Keep each RPC within its 100-bundle transaction limit.
      for (let index = 0; index < fresh.length; index += 100) {
        const batch = fresh.slice(index, index + 100);
        const previous = new Map(
          (await store.comics(batch.map((c) => c.id))).map((row) => [
            row.comic.id,
            row,
          ]),
        );
        const bundles = batch.map((comic) => {
          const old = previous.get(comic.id);
          return bundleSchema.parse({
            comic,
            chapters: [],
            chapter_list_complete:
              !!old?.complete &&
              old.comic.latest_chapter_number === comic.latest_chapter_number,
          });
        });
        await store.commit(cursor, bundles, false, index === 0 ? requests : 0);
        batch.forEach((comic) => imported.add(comic.id));
      }
    };
    const result = await discoverCatalog(scraper, (comics) =>
      saveCatalog(comics, 1),
    );
    if (!result.complete)
      throw new Error("Catalog discovery incomplete; checkpoint preserved");
    // A tiny catalog can be satisfied entirely by the first probe.
    await saveCatalog(result.comics);
    await store.commit(
      { phase: "chapters", comicId: null, page: 1, seen: [] },
      [],
      true,
    );
    return { done: false };
  }
  if (cursor.phase === "chapters") {
    let next = cursor;
    for (let unit = 0; unit < 5; unit++) {
      const row = await store.pendingComic(next.comicId);
      if (!row) {
        await store.commit({ phase: "pages" }, [], true);
        return { done: false };
      }
      const current =
        next.comicId === row.comic.id
          ? next
          : {
              phase: "chapters" as const,
              comicId: row.comic.id,
              page: 1,
              seen: [],
            };
      const page = await scraper.chapterPage(row.comic, current.page, 100);
      const seen = [
        ...new Set([...current.seen, ...page.chapters.map((ch) => ch.id)]),
      ];
      const last = current.page >= page.meta.total_page;
      if (last && seen.length !== page.meta.total_record)
        throw new Error(
          "Chapter count changed or list incomplete; retry this checkpoint",
        );
      next = last
        ? { phase: "chapters", comicId: null, page: 1, seen: [] }
        : { ...current, page: current.page + 1, seen };
      await store.commit(
        next,
        [
          {
            comic: row.comic,
            chapters: page.chapters,
            chapter_list_complete: last,
          },
        ],
        false,
        1,
      );
    }
    await store.commit(next, [], true);
    return { done: false };
  }
  const chapters = await store.pendingChapters(40);
  if (!chapters.length) {
    await store.commit(cursor, [], true, 0, true);
    return { done: true };
  }
  const parents = new Map(
    (await store.comics([...new Set(chapters.map((ch) => ch.comic_id))])).map(
      (row) => [row.comic.id, row],
    ),
  );
  for (const chapter of chapters) {
    const parent = parents.get(chapter.comic_id);
    if (!parent) throw new Error("Chapter parent missing");
    const fetched = await scraper.reader(chapter, parent.comic.source_comic_id);
    // Each manifest and its checkpoint commit in one fenced transaction.
    await store.commit(
      cursor,
      [
        {
          comic: parent.comic,
          chapter_list_complete: parent.complete,
          chapters: [fetched],
        },
      ],
      false,
      1,
    );
  }
  await store.commit(cursor, [], true);
  return { done: false };
}
