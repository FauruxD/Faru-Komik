import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, CatalogComic } from "../lib/types";
import { comicSchema, chapterSchema, type ComicBundle } from "../data/schema";
import {
  jobSchema,
  type CloudStore,
  type Cursor,
  type ComicRecord,
} from "./model";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json | undefined };
type CloudDatabase = {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Record<string, { Args: Record<string, Json>; Returns: Json }>;
  };
};
export function cloudDatabase() {
  const url = z
    .url()
    .parse(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = z.string().min(20).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return createClient<CloudDatabase>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        }),
    },
  });
}
export async function cloudRpc(name: string, args: Record<string, Json> = {}) {
  const { data, error } = await cloudDatabase().rpc(name, args);
  if (error) throw new Error(`Cloud database operation failed (${error.code})`);
  return data;
}
export const readJob = async () =>
  jobSchema.parse(await cloudRpc("scrape_control"));
function record(row: CatalogComic): ComicRecord {
  const { chapter_list_complete, ...comic } = row;
  return { comic: comicSchema.parse(comic), complete: chapter_list_complete };
}
export function persistentStore(generation: string, owner: string): CloudStore {
  return {
    async pendingComic(id) {
      let query = cloudDatabase()
        .from("comics")
        .select("*")
        .eq("chapter_list_complete", false);
      if (id) query = query.eq("id", id);
      const { data, error } = await query.order("id").limit(1).maybeSingle();
      if (error) throw new Error(`Comic queue failed (${error.code})`);
      if (!data && id)
        throw new Error("Chapter checkpoint comic is no longer pending");
      return data ? record(data) : null;
    },
    async comics(ids) {
      if (!ids.length) return [];
      const { data, error } = await cloudDatabase()
        .from("comics")
        .select("*")
        .in("id", ids);
      if (error) throw new Error(`Comic lookup failed (${error.code})`);
      return data.map(record);
    },
    async pendingChapters(limit) {
      const { data, error } = await cloudDatabase()
        .from("chapters")
        .select("*")
        .is("pages_fetched_at", null)
        .order("comic_id")
        .order("number")
        .order("id")
        .limit(limit);
      if (error) throw new Error(`Reader queue failed (${error.code})`);
      return data.map((ch) => chapterSchema.parse({ ...ch, pages: null }));
    },
    async commit(
      cursor: Cursor,
      bundles: ComicBundle[],
      release: boolean,
      requests = 0,
      finish = false,
    ) {
      await cloudRpc("commit_scrape_batch", {
        p_generation: generation,
        p_owner: owner,
        p_cursor: cursor,
        p_bundles: bundles,
        p_release: release,
        p_requests: requests,
        p_finish: finish,
      });
    },
  };
}
