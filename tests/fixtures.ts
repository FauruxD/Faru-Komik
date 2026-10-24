import {
  normalizeChapter,
  normalizeComic,
  normalizePages,
} from "../src/scraper/shinigami.js";

export const comicId = "aa01aeec-f55b-4754-9818-6c68ba0015ef";
export const chapterId = "eac30930-e1ac-46b8-8ac0-be7bb7c3b5ad";
export const chapterId2 = "f8e5b481-593c-4eee-928f-32a73441672d";
export const at = "2026-10-23T08:00:00.000Z";
export const source = {
  manga_id: comicId,
  title: "Contoh komik",
  status: 1,
  release_year: "2026",
  cover_image_url: "https://assets.shngm.id/cover/example.webp",
  taxonomy: {
    Genre: [{ name: "Fantasy", slug: "fantasy" }],
    Author: [{ name: "Penulis", slug: "penulis" }],
    Format: [{ name: "Manhwa", slug: "manhwa" }],
  },
};
export const sourceChapter = {
  manga_id: comicId,
  chapter_id: chapterId,
  chapter_number: 0.5,
};
export const detail = {
  ...sourceChapter,
  base_url: "https://assets.shngm.id",
  chapter: { path: "/chapter/example/", data: ["1.webp", "2.webp"] },
};

export function fixtureBundle() {
  const comic = normalizeComic(source, at);
  const chapter = normalizeChapter(sourceChapter, comic, at);
  return {
    comic,
    chapter_list_complete: true,
    chapters: [normalizePages(detail, chapter, comicId, at)],
  };
}
