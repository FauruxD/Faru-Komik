import { appendFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { FullStore, missingFile } from "../data/full-store.js";
import { readDataset, saveJson } from "../data/files.js";
import type { Comic, Chapter } from "../data/schema.js";
import { discoverCatalog } from "../scraper/catalog.js";
import { AccessError, HttpClient } from "../scraper/http.js";
import { ShinigamiScraper } from "../scraper/shinigami.js";
import { integerOption, reportError, requireLocalScraping } from "./shared.js";

async function main() {
  const { values } = parseArgs({
    options: {
      directory: { type: "string", default: "data/shinigami-full" },
      phase: { type: "string", default: "all" },
      "refresh-catalog": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(`npm run scrape:all -- [--directory data/shinigami-full] [--phase all|catalog|chapters|pages] [--refresh-catalog]
All titles and all reader image references; no image downloads. Saves every chapter separately.
Run the same command to resume. Only one worker per directory. Ctrl+C stops after the current request.
Phase chapters indexes lists only; pages processes existing lists. Phase all runs every stage.`);
    return;
  }
  requireLocalScraping();
  const phase = z
    .enum(["all", "catalog", "chapters", "pages"])
    .parse(values.phase);
  const store = new FullStore(values.directory);
  const unlock = await store.lock();
  const delayMs = integerOption(
    process.env.SCRAPER_DELAY_MS ?? "1500",
    "SCRAPER_DELAY_MS",
    1000,
    60000,
  );
  const started = new Date().toISOString();
  const state = {
    pid: process.pid,
    started_at: started,
    updated_at: started,
    status: "running",
    phase: "catalog",
    catalog_comics: 0,
    listed_comics: 0,
    chapters: 0,
    readable_chapters: 0,
    page_references: 0,
    failures_this_run: 0,
    current_comic: "",
    current_chapter: null as number | null,
    minimum_remaining_seconds: null as number | null,
  };
  const progress = async () => {
    state.updated_at = new Date().toISOString();
    await saveJson(join(store.root, "progress.json"), state);
  };
  let stopped = false;
  const stop = () => {
    stopped = true;
    console.log("Stop requested; saving current checkpoint.");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let consecutiveFailures = 0;
  const failed = async (kind: string, id: string, error: unknown) => {
    state.failures_this_run++;
    consecutiveFailures++;
    const message = error instanceof Error ? error.message : "Unknown error";
    await appendFile(
      join(store.root, "failures.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), kind, id, message })}\n`,
    );
    console.error(`${kind} ${id}: ${message}`);
    if (error instanceof AccessError || consecutiveFailures >= 3) throw error;
  };
  try {
    const http = new HttpClient({
      delayMs,
      userAgent: process.env.SCRAPER_USER_AGENT || "KomikCatalogBot/0.1",
    });
    const scraper = new ShinigamiScraper(http);
    await progress();
    await http.checkWebsite();
    let catalogComplete = false;
    try {
      const report = z
        .object({ complete: z.boolean() })
        .parse(
          JSON.parse(
            await readFile(join(store.root, "catalog-report.json"), "utf8"),
          ) as unknown,
        );
      catalogComplete = report.complete && !values["refresh-catalog"];
    } catch (error) {
      if (!missingFile(error)) throw error;
    }
    if (!catalogComplete) {
      await saveJson(join(store.root, "catalog-report.json"), {
        complete: false,
      });
      const result = await discoverCatalog(scraper, async (comics, label) => {
        await store.saveCatalog(comics);
        state.catalog_comics = comics.length;
        console.log(`Catalog: ${label}; ${comics.length} unique titles`);
        await progress();
        if (stopped) throw new Error("Stopped after catalog checkpoint");
      });
      await store.saveCatalog(result.comics);
      await saveJson(join(store.root, "catalog-report.json"), {
        ...result,
        comics: undefined,
        discovered_at: new Date().toISOString(),
      });
      if (!result.complete)
        throw new Error(
          `Catalog discovery incomplete: ${JSON.stringify(result.observed_by_format)} vs ${JSON.stringify(result.expected_by_format)}`,
        );
    }
    const catalog = await store.catalog();
    state.catalog_comics = catalog.bundles.length;
    console.log(
      `Catalog: ${state.catalog_comics} unique titles verified against source format counts`,
    );

    // Keep the original successful sample, including its reader references.
    try {
      const sample = await readDataset(resolve("data/shinigami.json"));
      for (const bundle of sample.bundles) {
        if (!(await store.bundle(bundle.comic))) await store.saveBundle(bundle);
        for (const chapter of bundle.chapters) {
          if (chapter.pages && !(await store.chapter(chapter)))
            await store.saveChapter(chapter);
        }
      }
    } catch (error) {
      if (!missingFile(error)) throw error;
    }
    if (phase === "catalog") {
      state.status = "catalog_complete";
      await progress();
      return;
    }

    state.phase = "chapters";
    const queue: { comic: Comic; chapter: Chapter }[] = [];
    for (const item of catalog.bundles) {
      if (stopped) break;
      const comic = item.comic;
      state.current_comic = comic.title;
      let bundle = await store.bundle(comic);
      if (!bundle?.chapter_list_complete && phase !== "pages") {
        try {
          const previous = bundle;
          bundle = await scraper.chapters(
            comic,
            { chapterPages: 10000, pageSize: 100 },
            async (partial) => {
              const retained = new Map(
                previous?.chapters.map((chapter) => [chapter.id, chapter]),
              );
              for (const chapter of partial.chapters) {
                const old = retained.get(chapter.id);
                retained.set(
                  chapter.id,
                  old?.pages
                    ? {
                        ...chapter,
                        pages: old.pages,
                        pages_fetched_at: old.pages_fetched_at,
                      }
                    : chapter,
                );
              }
              await store.saveBundle({
                ...partial,
                chapters: [...retained.values()],
              });
              if (stopped)
                throw new Error("Stopped after chapter-list checkpoint");
            },
          );
          // Use the merged checkpoint so previously fetched pages survive.
          bundle = await store.bundle(comic);
          consecutiveFailures = 0;
        } catch (error) {
          if (stopped) break;
          await failed("chapter-list", comic.source_comic_id, error);
          bundle = await store.bundle(comic);
        }
      }
      if (bundle) {
        if (bundle.chapter_list_complete) state.listed_comics++;
        state.chapters += bundle.chapters.length;
        for (const chapter of bundle.chapters) {
          const cached =
            (await store.chapter(chapter)) ?? (chapter.pages ? chapter : null);
          if (cached) {
            state.readable_chapters++;
            state.page_references += cached.pages?.length ?? 0;
          } else queue.push({ comic, chapter });
        }
      }
      console.log(
        `Chapters: ${state.listed_comics}/${state.catalog_comics} titles complete; ${state.chapters} chapters indexed`,
      );
      await progress();
    }
    if (phase !== "chapters" && !stopped) {
      state.phase = "pages";
      console.log(
        `Reader queue: ${queue.length} chapters pending; minimum request pacing ${Math.ceil((queue.length * delayMs) / 1000)} seconds, excluding network time`,
      );
      for (let index = 0; index < queue.length; index++) {
        if (stopped) break;
        const entry = queue[index];
        if (!entry) continue;
        state.current_comic = entry.comic.title;
        state.current_chapter = entry.chapter.number;
        state.minimum_remaining_seconds = Math.ceil(
          ((queue.length - index) * delayMs) / 1000,
        );
        try {
          const chapter = await scraper.reader(
            entry.chapter,
            entry.comic.source_comic_id,
          );
          await store.saveChapter(chapter);
          state.readable_chapters++;
          state.page_references += chapter.pages?.length ?? 0;
          consecutiveFailures = 0;
          console.log(
            `Reader: ${state.readable_chapters}/${state.chapters}; ${entry.comic.title} #${chapter.number}; ${state.page_references} image references`,
          );
        } catch (error) {
          await failed("reader", entry.chapter.source_chapter_id, error);
        }
        await progress();
      }
    }
    state.status = stopped
      ? "stopped"
      : state.listed_comics === state.catalog_comics &&
          state.readable_chapters === state.chapters &&
          state.failures_this_run === 0
        ? "complete"
        : phase === "chapters" && state.listed_comics === state.catalog_comics
          ? "chapters_complete"
          : "partial";
    state.minimum_remaining_seconds =
      state.status === "complete" ? 0 : state.minimum_remaining_seconds;
    await progress();
    console.log(JSON.stringify(state, null, 2));
    if (state.status === "partial") process.exitCode = 1;
  } catch (error) {
    state.status = stopped ? "stopped" : "failed";
    await progress();
    throw error;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await unlock();
  }
}

main().catch(reportError);
