import { createHash } from "node:crypto";
import { z } from "zod";
import {
  bundleSchema,
  type Chapter,
  type Comic,
  type ComicBundle,
} from "../data/schema";
import type { HttpClient } from "./http";

export const WEBSITE = "https://11.shinigami.asia";
export const API = "https://api.shngm.io";

export interface CatalogFilter {
  format?: "manga" | "manhwa" | "manhua";
  order?: "asc" | "desc";
}

const taxonomy = z
  .record(z.string(), z.array(z.object({ name: z.string(), slug: z.string() })))
  .default({});
const sourceComic = z.object({
  manga_id: z.uuid(),
  title: z.string().min(1),
  description: z.string().nullish(),
  alternative_title: z.string().nullish(),
  cover_image_url: z.string().nullish(),
  cover_portrait_url: z.string().nullish(),
  country_id: z.string().nullish(),
  status: z.number().int(),
  release_year: z.string().nullish(),
  user_rate: z.number().nullish(),
  latest_chapter_number: z.number().nullish(),
  updated_at: z.string().nullish(),
  deleted_at: z.string().nullish(),
  taxonomy,
});
const sourceChapter = z.object({
  chapter_id: z.uuid(),
  manga_id: z.uuid(),
  chapter_number: z.number().nonnegative(),
  chapter_title: z.string().nullish(),
  release_date: z.string().nullish(),
});
const pageMeta = z.object({
  page: z.number().int().positive(),
  total_page: z.number().int().nonnegative(),
  total_record: z.number().int().nonnegative(),
});
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({ retcode: z.literal(0), data });
const listEnvelope = <T extends z.ZodType>(data: T) =>
  envelope(z.array(data)).extend({ meta: pageMeta });
const chapterDetail = sourceChapter.extend({
  base_url: z.url(),
  chapter: z.object({
    path: z.string().min(1),
    data: z.array(z.string().min(1)).min(1),
  }),
});

export function stableId(kind: "comic" | "chapter", sourceId: string): string {
  const bytes = createHash("sha256")
    .update(`shinigami:${kind}:${sourceId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x80;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeComic(input: unknown, at: string): Comic {
  const item = sourceComic.parse(input);
  const names = (key: string) => [
    ...new Set((item.taxonomy[key] ?? []).map((term) => term.name)),
  ];
  const slug =
    item.title
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "komik";
  const year = Number(item.release_year);
  return {
    id: stableId("comic", item.manga_id),
    source: "shinigami",
    source_comic_id: item.manga_id,
    source_url: `${WEBSITE}/series/${item.manga_id}`,
    slug: `${slug}-${item.manga_id}`,
    title: item.title.trim(),
    alternative_title: item.alternative_title || null,
    description: item.description ?? "",
    cover_url: item.cover_portrait_url || item.cover_image_url || null,
    format: names("Format")[0]?.toLowerCase() ?? null,
    country: item.country_id || null,
    source_status: item.status,
    release_year:
      Number.isInteger(year) && year >= 1800 && year <= 2200 ? year : null,
    rating: item.user_rate ?? null,
    genres: names("Genre"),
    authors: names("Author"),
    artists: names("Artist"),
    latest_chapter_number: item.latest_chapter_number ?? null,
    source_updated_at: item.updated_at || null,
    scraped_at: at,
  };
}

export function normalizeChapter(
  input: unknown,
  comic: Comic,
  at: string,
): Chapter {
  const item = sourceChapter.parse(input);
  if (item.manga_id !== comic.source_comic_id)
    throw new Error("Chapter belongs to a different comic");
  return {
    id: stableId("chapter", item.chapter_id),
    comic_id: comic.id,
    source_chapter_id: item.chapter_id,
    source_url: `${WEBSITE}/chapter/${item.chapter_id}`,
    number: item.chapter_number,
    title: item.chapter_title ?? "",
    released_at: item.release_date || null,
    scraped_at: at,
    pages_fetched_at: null,
    pages: null,
  };
}

export function normalizePages(
  input: unknown,
  chapter: Chapter,
  sourceComicId: string,
  at: string,
): Chapter {
  const detail = chapterDetail.parse(input);
  if (
    detail.chapter_id !== chapter.source_chapter_id ||
    detail.manga_id !== sourceComicId ||
    detail.chapter_number !== chapter.number
  ) {
    throw new Error("Reader detail does not match the requested chapter");
  }
  const base = new URL(detail.base_url);
  if (
    base.protocol !== "https:" ||
    ![
      "assets.shngm.id",
      "storage.shngm.id",
      "delivery.shngm.id",
      "mirror1.shngm.id",
      "mirror2.shngm.id",
    ].includes(base.hostname)
  ) {
    throw new Error("Unknown image host in source response");
  }
  const folder = new URL(detail.chapter.path.replace(/\/?$/, "/"), base);
  if (folder.origin !== base.origin)
    throw new Error("Image path escapes the source host");
  const pages = detail.chapter.data.map((filename, index) => {
    if (filename.includes("/") || filename.includes("\\") || filename === "..")
      throw new Error("Invalid page filename");
    return {
      position: index + 1,
      image_url: new URL(encodeURIComponent(filename), folder).href,
    };
  });
  return { ...chapter, pages, pages_fetched_at: at };
}

export class ShinigamiScraper {
  constructor(private readonly http: HttpClient) {}

  async catalog(page: number, pageSize: number, filter: CatalogFilter = {}) {
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort: "latest",
      sort_order: filter.order ?? "desc",
      ...(filter.format ? { format: filter.format } : {}),
    });
    return listEnvelope(sourceComic)
      .extend({
        facet: z
          .object({
            "taxonomy.Format.name": z
              .record(z.string(), z.number().int().nonnegative())
              .optional(),
          })
          .optional(),
      })
      .parse(await this.http.json(`${API}/v1/manga/list?${query}`));
  }

  async comic(
    sourceId: string,
    options: { chapterPages: number; readerChapters: number; pageSize: number },
  ): Promise<ComicBundle> {
    const at = new Date().toISOString();
    const response = envelope(sourceComic).parse(
      await this.http.json(`${API}/v1/manga/detail/${sourceId}`),
    );
    if (response.data.manga_id !== sourceId || response.data.deleted_at)
      throw new Error("Source comic missing, deleted, or mismatched");
    const comic = normalizeComic(response.data, at);
    const bundle = await this.chapters(comic, options);
    for (
      let i = 0;
      i < Math.min(options.readerChapters, bundle.chapters.length);
      i++
    ) {
      const chapter = bundle.chapters[i];
      if (chapter) bundle.chapters[i] = await this.reader(chapter, sourceId);
    }
    return bundleSchema.parse(bundle);
  }

  async chapters(
    comic: Comic,
    options: { chapterPages: number; pageSize: number },
    onPage?: (bundle: ComicBundle) => Promise<void>,
  ): Promise<ComicBundle> {
    const at = new Date().toISOString();
    const chapters = new Map<string, Chapter>();
    let complete = false;
    for (let page = 1; page <= options.chapterPages; page++) {
      const result = await this.chapterPage(comic, page, options.pageSize, at);
      for (const chapter of result.chapters) {
        chapters.set(chapter.id, chapter);
      }
      if (page >= result.meta.total_page) {
        complete = chapters.size === result.meta.total_record;
        if (onPage)
          await onPage(
            bundleSchema.parse({
              comic,
              chapter_list_complete: complete,
              chapters: [...chapters.values()],
            }),
          );
        break;
      }
      if (result.chapters.length === 0)
        throw new Error("Unexpected empty chapter page");
      if (onPage)
        await onPage(
          bundleSchema.parse({
            comic,
            chapter_list_complete: false,
            chapters: [...chapters.values()],
          }),
        );
    }
    const ordered = [...chapters.values()].sort(
      (a, b) => a.number - b.number || a.id.localeCompare(b.id),
    );
    return bundleSchema.parse({
      comic,
      chapter_list_complete: complete,
      chapters: ordered,
    });
  }

  async chapterPage(
    comic: Comic,
    page: number,
    pageSize = 100,
    at = new Date().toISOString(),
  ) {
    const query = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      sort_by: "chapter_number",
      sort_order: "asc",
    });
    const result = listEnvelope(sourceChapter).parse(
      await this.http.json(
        `${API}/v1/chapter/${comic.source_comic_id}/list?${query}`,
      ),
    );
    if (result.meta.page !== page)
      throw new Error("Source returned the wrong chapter page");
    if (result.data.length === 0 && page < result.meta.total_page)
      throw new Error("Unexpected empty chapter page");
    return {
      meta: result.meta,
      chapters: result.data.map((item) => normalizeChapter(item, comic, at)),
    };
  }

  async reader(chapter: Chapter, sourceComicId: string): Promise<Chapter> {
    const result = envelope(chapterDetail).parse(
      await this.http.json(
        `${API}/v1/chapter/detail/${chapter.source_chapter_id}`,
      ),
    );
    return normalizePages(
      result.data,
      chapter,
      sourceComicId,
      new Date().toISOString(),
    );
  }
}
