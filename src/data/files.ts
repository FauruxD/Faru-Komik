import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { datasetSchema, type Dataset } from "./schema.js";
import { WEBSITE } from "../scraper/shinigami.js";

export async function readDataset(path: string): Promise<Dataset> {
  return datasetSchema.parse(
    JSON.parse(await readFile(path, "utf8")) as unknown,
  );
}

export async function loadCheckpoint(path: string): Promise<Dataset> {
  try {
    return await readDataset(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
    return {
      version: 1,
      source: "shinigami",
      source_url: WEBSITE,
      updated_at: new Date().toISOString(),
      bundles: [],
    };
  }
}

export async function saveDataset(
  path: string,
  dataset: Dataset,
): Promise<void> {
  const validated = datasetSchema.parse(dataset);
  await saveJson(path, validated);
}

export async function saveJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, path);
}

export function summarize(dataset: Dataset) {
  return {
    comics: dataset.bundles.length,
    chapters: dataset.bundles.reduce(
      (n, bundle) => n + bundle.chapters.length,
      0,
    ),
    readable_chapters: dataset.bundles.reduce(
      (n, bundle) =>
        n + bundle.chapters.filter((chapter) => chapter.pages !== null).length,
      0,
    ),
    page_references: dataset.bundles.reduce(
      (n, bundle) =>
        n +
        bundle.chapters.reduce(
          (count, chapter) => count + (chapter.pages?.length ?? 0),
          0,
        ),
      0,
    ),
    complete_chapter_lists: dataset.bundles.filter(
      (bundle) => bundle.chapter_list_complete,
    ).length,
  };
}
