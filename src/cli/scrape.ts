import { parseArgs } from "node:util";
import { z } from "zod";
import { loadCheckpoint, saveDataset, summarize } from "../data/files.js";
import { AccessError, HttpClient } from "../scraper/http.js";
import { ShinigamiScraper } from "../scraper/shinigami.js";
import { datasetPath, integerOption, reportError } from "./shared.js";

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      output: { type: "string", default: "data/shinigami.json" },
      "max-comics": { type: "string", default: "5" },
      "catalog-pages": { type: "string", default: "1" },
      "chapter-pages": { type: "string", default: "20" },
      "reader-chapters": { type: "string", default: "1" },
      "page-size": { type: "string", default: "50" },
      "comic-id": { type: "string", multiple: true },
      refresh: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(`Scrape Shinigami into a validated JSON checkpoint.
  --output PATH          Dataset/checkpoint (default data/shinigami.json)
  --max-comics N         Maximum titles processed per run (default 5)
  --catalog-pages N      Catalog pages to inspect (default 1)
  --chapter-pages N      Maximum chapter-list pages per comic (default 20)
  --reader-chapters N    Fetch page references for first N chapters per comic (default 1; 0 skips)
  --page-size N          Records per API list request (1–100; default 50)
  --comic-id UUID        Target a source comic; repeat for more titles
  --refresh              Refresh existing titles; preserves previously fetched reader pages
Without --refresh, existing comics are skipped. Limits are per run. No image files are downloaded.`);
    return;
  }
  const maxComics = integerOption(values["max-comics"], "max-comics", 1, 10000);
  const catalogPages = integerOption(
    values["catalog-pages"],
    "catalog-pages",
    1,
    10000,
  );
  const chapterPages = integerOption(
    values["chapter-pages"],
    "chapter-pages",
    1,
    10000,
  );
  const readerChapters = integerOption(
    values["reader-chapters"],
    "reader-chapters",
    0,
    100000,
  );
  const pageSize = integerOption(values["page-size"], "page-size", 1, 100);
  const delay = integerOption(
    process.env.SCRAPER_DELAY_MS ?? "1500",
    "SCRAPER_DELAY_MS",
    1000,
    60000,
  );
  const ids = values["comic-id"]?.map((id) => z.uuid().parse(id));
  const output = datasetPath(values.output);
  const dataset = await loadCheckpoint(output);
  const http = new HttpClient({
    delayMs: delay,
    userAgent: process.env.SCRAPER_USER_AGENT || "KomikCatalogBot/0.1",
  });
  const scraper = new ShinigamiScraper(http);
  await http.checkWebsite();
  let processed = 0;
  let failed = 0;
  const seen = new Set<string>();
  async function processComic(id: string) {
    if (seen.has(id) || processed >= maxComics) return;
    seen.add(id);
    const previous = dataset.bundles.find(
      (bundle) => bundle.comic.source_comic_id === id,
    );
    if (previous && !values.refresh) return;
    processed++;
    try {
      const bundle = await scraper.comic(id, {
        chapterPages,
        readerChapters,
        pageSize,
      });
      // A partial refresh must not erase chapters or page manifests already collected.
      const chapters = new Map(
        previous?.chapters.map((chapter) => [chapter.id, chapter]),
      );
      for (const chapter of bundle.chapters) {
        const old = chapters.get(chapter.id);
        chapters.set(
          chapter.id,
          chapter.pages === null && old?.pages
            ? {
                ...chapter,
                pages: old.pages,
                pages_fetched_at: old.pages_fetched_at,
              }
            : chapter,
        );
      }
      bundle.chapters = [...chapters.values()].sort(
        (a, b) => a.number - b.number || a.id.localeCompare(b.id),
      );
      dataset.bundles = dataset.bundles.filter(
        (item) => item.comic.id !== bundle.comic.id,
      );
      dataset.bundles.push(bundle);
      dataset.updated_at = new Date().toISOString();
      await saveDataset(output, dataset);
      console.log(
        `[${processed}/${maxComics}] ${bundle.comic.title}: ${bundle.chapters.length} chapters; chapter list ${bundle.chapter_list_complete ? "complete" : "partial"}`,
      );
    } catch (error) {
      if (error instanceof AccessError) throw error;
      failed++;
      console.error(
        `Failed comic ${id}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
  if (ids) {
    for (const id of ids) await processComic(id);
  } else {
    for (let page = 1; page <= catalogPages && processed < maxComics; page++) {
      const catalog = await scraper.catalog(page, pageSize);
      if (catalog.meta.page !== page)
        throw new Error("Source returned the wrong catalog page");
      for (const comic of catalog.data) {
        if (!comic.deleted_at) await processComic(comic.manga_id);
      }
      if (page >= catalog.meta.total_page || catalog.data.length === 0) break;
    }
  }
  console.log(
    JSON.stringify(
      { output, processed, failed, ...summarize(dataset) },
      null,
      2,
    ),
  );
  if (dataset.bundles.length === 0)
    throw new Error(
      "No comics collected; no successful empty dataset was written",
    );
  if (failed > 0) process.exitCode = 1;
}

main().catch(reportError);
