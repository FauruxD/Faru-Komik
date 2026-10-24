"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import {
  catalogComicSchema,
  type SavedComic,
  type ReadingEntry,
} from "./types";

const savedSchema = catalogComicSchema
  .pick({
    id: true,
    slug: true,
    title: true,
    cover_url: true,
    format: true,
    rating: true,
    latest_chapter_number: true,
  })
  .extend({ slug: z.string().regex(/^[a-z0-9-]+$/) });
const librarySchema = z.object({
  bookmarks: z.array(savedSchema).max(500),
  history: z
    .array(
      z.object({
        comic: savedSchema,
        chapterId: z.uuid(),
        chapterNumber: z.number().nonnegative(),
        readAt: z.iso.datetime(),
      }),
    )
    .max(50),
});
type Library = z.infer<typeof librarySchema>;
const EMPTY: Library = { bookmarks: [], history: [] };
const KEY = "faru-library-v1";
const EVENT = "faru-library-change";
let cached: Library = EMPTY;
let cachedRaw: string | null = null;

function snapshot(): Library {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cachedRaw) return cached;
    const parsed = raw
      ? librarySchema.safeParse(JSON.parse(raw) as unknown)
      : null;
    cachedRaw = raw;
    cached = parsed?.success ? parsed.data : EMPTY;
    return cached;
  } catch {
    return EMPTY;
  }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(EVENT, listener);
  };
}
function write(value: Library): boolean {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify(librarySchema.parse(value)),
    );
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}
export function useLibrary() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
export function savedComic(comic: SavedComic): SavedComic {
  return savedSchema.parse({
    id: comic.id,
    slug: comic.slug,
    title: comic.title,
    cover_url: comic.cover_url,
    format: comic.format,
    rating: comic.rating,
    latest_chapter_number: comic.latest_chapter_number,
  });
}
export function toggleBookmark(comic: SavedComic): boolean {
  const current = snapshot();
  const exists = current.bookmarks.some((item) => item.id === comic.id);
  const bookmarks = exists
    ? current.bookmarks.filter((item) => item.id !== comic.id)
    : [savedComic(comic), ...current.bookmarks].slice(0, 500);
  return write({ ...current, bookmarks });
}
export function rememberReading(entry: ReadingEntry): void {
  const current = snapshot();
  write({
    ...current,
    history: [
      entry,
      ...current.history.filter((item) => item.comic.id !== entry.comic.id),
    ].slice(0, 50),
  });
}
