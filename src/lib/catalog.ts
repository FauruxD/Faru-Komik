import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  catalogComicSchema,
  catalogChapterSchema,
  readerPageSchema,
  type Database,
} from "./types";
import type { catalogFilters } from "./format";

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing");
  // Public, read-only RLS client. Backend/import credentials never enter this module.
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(15_000),
          next: { revalidate: 60 },
        }),
    },
  });
}

export async function listComics(
  filters: ReturnType<typeof catalogFilters>,
  pageSize = 24,
) {
  let query = database().from("comics").select("*", { count: "exact" });
  if (filters.q)
    query = query.ilike("title", `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`);
  if (filters.format) query = query.eq("format", filters.format);
  if (filters.genre) query = query.contains("genres", [filters.genre]);
  if (filters.sort === "rating")
    query = query.order("rating", { ascending: false, nullsFirst: false });
  else if (filters.sort === "title")
    query = query.order("title", { ascending: true });
  else
    query = query.order("source_updated_at", {
      ascending: false,
      nullsFirst: false,
    });
  const { data, count, error } = await query
    .order("id")
    .range((filters.page - 1) * pageSize, filters.page * pageSize - 1);
  if (error) throw new Error(`Catalog query failed: ${error.code}`);
  return {
    comics: z.array(catalogComicSchema).parse(data),
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / pageSize),
  };
}

export const getComic = cache(async (slug: string) => {
  if (slug.length > 250) return null;
  const { data, error } = await database()
    .from("comics")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Comic query failed: ${error.code}`);
  return data ? catalogComicSchema.parse(data) : null;
});

export async function homeCatalog() {
  const [latest, rated, readable, count] = await Promise.all([
    database()
      .from("comics")
      .select("*")
      .order("source_updated_at", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(12),
    database()
      .from("comics")
      .select("*")
      .eq("chapter_list_complete", true)
      .not("cover_url", "is", null)
      .order("rating", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(8),
    database()
      .from("chapters")
      .select("comic_id")
      .not("pages_fetched_at", "is", null)
      .order("number")
      .limit(20),
    database().from("comics").select("id", { count: "exact", head: true }),
  ]);
  for (const result of [latest, rated, readable, count])
    if (result.error)
      throw new Error(`Homepage query failed: ${result.error.code}`);
  const ids = [
    ...new Set((readable.data ?? []).map((chapter) => chapter.comic_id)),
  ].slice(0, 4);
  const ready = ids.length
    ? await database().from("comics").select("*").in("id", ids)
    : null;
  if (ready?.error)
    throw new Error(`Readable comics query failed: ${ready.error.code}`);
  return {
    latest: z.array(catalogComicSchema).parse(latest.data),
    picks: z.array(catalogComicSchema).parse(rated.data),
    ready: z.array(catalogComicSchema).parse(ready?.data ?? []),
    total: count.count ?? 0,
  };
}

export async function comicChapters(
  comicId: string,
  page: number,
  ascending = false,
) {
  const { data, count, error } = await database()
    .from("chapters")
    .select("*", { count: "exact" })
    .eq("comic_id", comicId)
    .order("number", { ascending })
    .order("id")
    .range((page - 1) * 50, page * 50 - 1);
  if (error) throw new Error(`Chapter list query failed: ${error.code}`);
  return {
    chapters: z.array(catalogChapterSchema).parse(data),
    total: count ?? 0,
    pages: Math.ceil((count ?? 0) / 50),
  };
}

export async function firstReadableChapter(comicId: string) {
  const { data, error } = await database()
    .from("chapters")
    .select("id")
    .eq("comic_id", comicId)
    .not("pages_fetched_at", "is", null)
    .order("number")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`First chapter query failed: ${error.code}`);
  return data?.id ?? null;
}

export async function relatedComics(
  comicId: string,
  genre: string | undefined,
) {
  let query = database()
    .from("comics")
    .select("*")
    .neq("id", comicId)
    .order("rating", { ascending: false, nullsFirst: false })
    .order("id")
    .limit(6);
  if (genre) query = query.contains("genres", [genre]);
  const { data, error } = await query;
  if (error) throw new Error(`Related comics query failed: ${error.code}`);
  return z.array(catalogComicSchema).parse(data);
}

export const getReader = cache(async (id: string) => {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await database()
    .from("chapters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Reader query failed: ${error.code}`);
  if (!data) return null;
  const chapter = catalogChapterSchema.parse(data);
  const [comicResult, pagesResult, previous, next] = await Promise.all([
    database().from("comics").select("*").eq("id", chapter.comic_id).single(),
    database()
      .from("chapter_pages")
      .select("*")
      .eq("chapter_id", id)
      .order("position"),
    database()
      .from("chapters")
      .select("id,number")
      .eq("comic_id", chapter.comic_id)
      .lt("number", chapter.number)
      .order("number", { ascending: false })
      .order("id")
      .limit(1)
      .maybeSingle(),
    database()
      .from("chapters")
      .select("id,number")
      .eq("comic_id", chapter.comic_id)
      .gt("number", chapter.number)
      .order("number")
      .order("id")
      .limit(1)
      .maybeSingle(),
  ]);
  for (const result of [comicResult, pagesResult, previous, next])
    if (result.error)
      throw new Error(`Reader data query failed: ${result.error.code}`);
  return {
    comic: catalogComicSchema.parse(comicResult.data),
    chapter,
    pages: z.array(readerPageSchema).parse(pagesResult.data),
    previous: previous.data,
    next: next.data,
  };
});
