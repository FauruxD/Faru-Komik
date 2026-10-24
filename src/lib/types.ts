import { z } from "zod";
import { comicSchema, chapterSchema, pageSchema } from "../data/schema";

export const catalogComicSchema = comicSchema.extend({
  chapter_list_complete: z.boolean(),
});
// Database rows have no embedded manifest; its cross-field refinement is only
// relevant to scraper bundles, not to the chapter metadata table.
export const catalogChapterSchema = z
  .object(chapterSchema.shape)
  .omit({ pages: true })
  .strict();
export const readerPageSchema = pageSchema.extend({ chapter_id: z.uuid() });
export type CatalogComic = z.infer<typeof catalogComicSchema>;
export type CatalogChapter = z.infer<typeof catalogChapterSchema>;
export type ReaderPage = z.infer<typeof readerPageSchema>;

type ReadTable<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};
export interface Database {
  public: {
    Tables: {
      comics: ReadTable<CatalogComic>;
      chapters: ReadTable<CatalogChapter>;
      chapter_pages: ReadTable<ReaderPage>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type SavedComic = Pick<
  CatalogComic,
  | "id"
  | "slug"
  | "title"
  | "cover_url"
  | "format"
  | "rating"
  | "latest_chapter_number"
>;
export interface ReadingEntry {
  comic: SavedComic;
  chapterId: string;
  chapterNumber: number;
  readAt: string;
}
