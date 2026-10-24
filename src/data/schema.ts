import { z } from "zod";

const httpUrl = z.url().refine((value) => {
  const url = new URL(value);
  return (
    ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
  );
}, "Expected an HTTP(S) URL without credentials");
const timestamp = z.iso.datetime({ offset: true });

export const comicSchema = z
  .object({
    id: z.uuid(),
    source: z.literal("shinigami"),
    source_comic_id: z.uuid(),
    source_url: httpUrl,
    slug: z.string().min(1),
    title: z.string().min(1),
    alternative_title: z.string().nullable(),
    description: z.string(),
    cover_url: httpUrl.nullable(),
    format: z.string().nullable(),
    country: z.string().nullable(),
    source_status: z.number().int(),
    release_year: z.number().int().min(1800).max(2200).nullable(),
    rating: z.number().min(0).max(10).nullable(),
    genres: z.array(z.string()),
    authors: z.array(z.string()),
    artists: z.array(z.string()),
    latest_chapter_number: z.number().nonnegative().nullable(),
    source_updated_at: timestamp.nullable(),
    scraped_at: timestamp,
  })
  .strict();

export const pageSchema = z
  .object({
    position: z.number().int().positive(),
    image_url: httpUrl,
  })
  .strict();

export const chapterSchema = z
  .object({
    id: z.uuid(),
    comic_id: z.uuid(),
    source_chapter_id: z.uuid(),
    source_url: httpUrl,
    number: z.number().nonnegative(),
    title: z.string(),
    released_at: timestamp.nullable(),
    scraped_at: timestamp,
    pages_fetched_at: timestamp.nullable(),
    // null means not fetched; an empty list must not mark a chapter as readable.
    pages: z.array(pageSchema).min(1).nullable(),
  })
  .strict()
  .superRefine((chapter, context) => {
    if ((chapter.pages === null) !== (chapter.pages_fetched_at === null)) {
      context.addIssue({
        code: "custom",
        message: "Pages and their fetch timestamp must agree",
      });
    }
    chapter.pages?.forEach((page, index) => {
      if (page.position !== index + 1) {
        context.addIssue({
          code: "custom",
          message: "Page positions must be contiguous and ordered",
        });
      }
    });
  });

export const bundleSchema = z
  .object({
    comic: comicSchema,
    chapter_list_complete: z.boolean(),
    chapters: z.array(chapterSchema),
  })
  .strict()
  .superRefine((bundle, context) => {
    const ids = new Set<string>();
    for (const chapter of bundle.chapters) {
      if (chapter.comic_id !== bundle.comic.id || ids.has(chapter.id)) {
        context.addIssue({
          code: "custom",
          message: "Duplicate chapter or invalid parent comic",
        });
      }
      ids.add(chapter.id);
    }
  });

export const datasetSchema = z
  .object({
    version: z.literal(1),
    source: z.literal("shinigami"),
    source_url: httpUrl,
    updated_at: timestamp,
    bundles: z.array(bundleSchema),
  })
  .strict()
  .superRefine((dataset, context) => {
    const ids = dataset.bundles.map((bundle) => bundle.comic.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Dataset contains duplicate comics",
      });
    }
  });

export type Comic = z.infer<typeof comicSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type ComicBundle = z.infer<typeof bundleSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
