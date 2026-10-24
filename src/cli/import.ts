import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readDataset } from "../data/files.js";
import { FullStore } from "../data/full-store.js";
import type { ComicBundle } from "../data/schema.js";
import { datasetPath, reportError } from "./shared.js";

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string", default: "data/shinigami.json" },
      directory: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "npm run import:supabase -- [--input data/shinigami.json | --directory data/shinigami-full] [--dry-run]",
    );
    return;
  }
  async function* bundles(): AsyncGenerator<ComicBundle> {
    if (values.directory) {
      const store = new FullStore(values.directory);
      const catalog = await store.catalog();
      // Index the reader snapshots once per pass instead of probing a missing
      // file for every listed chapter in a large metadata-only archive.
      const readerFiles = await store.readerFiles();
      for (const item of catalog.bundles) {
        yield await store.hydrate(
          (await store.bundle(item.comic)) ?? item,
          readerFiles,
        );
      }
    } else {
      const dataset = await readDataset(datasetPath(values.input));
      yield* dataset.bundles;
    }
  }
  const summary = {
    comics: 0,
    chapters: 0,
    readable_chapters: 0,
    page_references: 0,
    complete_chapter_lists: 0,
  };
  // Validate the entire input before the first remote write. Directory mode
  // streams one comic at a time, rather than loading a complete reader archive.
  for await (const bundle of bundles()) {
    summary.comics++;
    summary.chapters += bundle.chapters.length;
    if (bundle.chapter_list_complete) summary.complete_chapter_lists++;
    for (const chapter of bundle.chapters) {
      if (chapter.pages) summary.readable_chapters++;
      summary.page_references += chapter.pages?.length ?? 0;
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  if (values["dry-run"]) {
    console.log("Validation passed. No database writes.");
    return;
  }
  const env = z
    .object({
      SUPABASE_URL: z
        .url()
        .refine(
          (url) =>
            new URL(url).protocol === "https:" ||
            ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
        ),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    })
    .safeParse(process.env);
  if (!env.success)
    throw new Error(
      "Fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local before importing. Apply the SQL migration first.",
    );
  const client = createClient(
    env.data.SUPABASE_URL,
    env.data.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  // Each RPC commits one whole comic, including its chapter/page rows, atomically.
  for await (const bundle of bundles()) {
    const { error } = await client.rpc("import_comic_bundle", {
      payload: bundle,
    });
    if (error)
      throw new Error(
        `Import failed for ${bundle.comic.title}: ${error.message}. Earlier comics are committed; rerunning is safe.`,
      );
    console.log(`Imported: ${bundle.comic.title}`);
  }
  console.log("Supabase import completed.");
}

main().catch(reportError);
