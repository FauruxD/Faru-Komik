import { readFile, readdir, mkdir, open, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import {
  bundleSchema,
  chapterSchema,
  type Comic,
  type ComicBundle,
  type Chapter,
  datasetSchema,
  type Dataset,
} from "./schema.js";
import { saveJson } from "./files.js";
import { WEBSITE } from "../scraper/shinigami.js";

export function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export class FullStore {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  async init() {
    await mkdir(join(this.root, "comics"), { recursive: true });
    await mkdir(join(this.root, "chapters"), { recursive: true });
  }

  async lock(): Promise<() => Promise<void>> {
    await this.init();
    const file = join(this.root, "worker.lock");
    try {
      const prior = z
        .object({ pid: z.number().int().positive() })
        .parse(JSON.parse(await readFile(file, "utf8")) as unknown);
      try {
        process.kill(prior.pid, 0);
      } catch (error) {
        if (!(
          error instanceof Error &&
          "code" in error &&
          error.code === "ESRCH"
        ))
          throw error;
        await unlink(file);
      }
    } catch (error) {
      if (!missingFile(error)) throw error;
    }
    const handle = await open(file, "wx");
    await handle.writeFile(
      JSON.stringify({
        pid: process.pid,
        started_at: new Date().toISOString(),
      }),
    );
    await handle.close();
    return async () => {
      await unlink(file);
    };
  }

  async saveCatalog(comics: Comic[]): Promise<void> {
    const dataset: Dataset = {
      version: 1,
      source: "shinigami",
      source_url: WEBSITE,
      updated_at: new Date().toISOString(),
      bundles: comics.map((comic) => ({
        comic,
        chapter_list_complete: false,
        chapters: [],
      })),
    };
    await saveJson(
      join(this.root, "catalog.json"),
      datasetSchema.parse(dataset),
    );
  }

  async catalog(): Promise<Dataset> {
    return datasetSchema.parse(
      JSON.parse(
        await readFile(join(this.root, "catalog.json"), "utf8"),
      ) as unknown,
    );
  }

  async saveBundle(bundle: ComicBundle): Promise<void> {
    const parsed = bundleSchema.parse(bundle);
    await saveJson(
      join(this.root, "comics", `${parsed.comic.id}.json`),
      parsed,
    );
  }

  async bundle(comic: Comic): Promise<ComicBundle | null> {
    z.uuid().parse(comic.id);
    try {
      const result = bundleSchema.parse(
        JSON.parse(
          await readFile(join(this.root, "comics", `${comic.id}.json`), "utf8"),
        ) as unknown,
      );
      if (
        result.comic.id !== comic.id ||
        result.comic.source_comic_id !== comic.source_comic_id
      )
        throw new Error("Comic checkpoint identity mismatch");
      return result;
    } catch (error) {
      if (missingFile(error)) return null;
      throw error;
    }
  }

  async saveChapter(chapter: Chapter): Promise<void> {
    const parsed = chapterSchema.parse(chapter);
    if (!parsed.pages)
      throw new Error("Cannot checkpoint an unfetched reader chapter");
    await saveJson(join(this.root, "chapters", `${parsed.id}.json`), parsed);
  }

  async chapter(chapter: Chapter): Promise<Chapter | null> {
    z.uuid().parse(chapter.id);
    try {
      const result = chapterSchema.parse(
        JSON.parse(
          await readFile(
            join(this.root, "chapters", `${chapter.id}.json`),
            "utf8",
          ),
        ) as unknown,
      );
      if (
        result.id !== chapter.id ||
        result.comic_id !== chapter.comic_id ||
        result.source_chapter_id !== chapter.source_chapter_id ||
        !result.pages
      )
        throw new Error("Reader checkpoint identity mismatch");
      return {
        ...chapter,
        pages: result.pages,
        pages_fetched_at: result.pages_fetched_at,
      };
    } catch (error) {
      if (missingFile(error)) return null;
      throw error;
    }
  }

  async readerFiles(): Promise<ReadonlySet<string>> {
    try {
      return new Set(
        (await readdir(join(this.root, "chapters"), { withFileTypes: true }))
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => entry.name),
      );
    } catch (error) {
      if (missingFile(error)) return new Set();
      throw error;
    }
  }

  async hydrate(
    bundle: ComicBundle,
    readerFiles?: ReadonlySet<string>,
  ): Promise<ComicBundle> {
    const chapters: Chapter[] = [];
    for (const chapter of bundle.chapters)
      chapters.push(
        readerFiles && !readerFiles.has(`${chapter.id}.json`)
          ? chapter
          : ((await this.chapter(chapter)) ?? chapter),
      );
    return bundleSchema.parse({ ...bundle, chapters });
  }
}
