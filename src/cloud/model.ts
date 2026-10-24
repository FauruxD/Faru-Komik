import { z } from "zod";
import type { Comic, Chapter, ComicBundle } from "../data/schema";

export const cursorSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("catalog") }),
  z.object({
    phase: z.literal("chapters"),
    comicId: z.uuid().nullable(),
    page: z.number().int().positive(),
    seen: z.array(z.uuid()),
  }),
  z.object({ phase: z.literal("pages") }),
]);
export type Cursor = z.infer<typeof cursorSchema>;
export const jobSchema = z.object({
  id: z.literal("shinigami"),
  enabled: z.boolean(),
  generation: z.uuid(),
  status: z.enum(["idle", "running", "paused", "blocked", "completed"]),
  cursor: cursorSchema,
  workflow_run_id: z.string().nullable(),
  source_requests: z.number(),
  completed_batches: z.number(),
  consecutive_failures: z.number(),
  last_error: z.string().nullable(),
  updated_at: z.string(),
});
export type Job = z.infer<typeof jobSchema>;
export const claimSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stop") }),
  z.object({ kind: z.literal("wait"), seconds: z.number().positive() }),
  z.object({ kind: z.literal("claimed"), job: jobSchema }),
]);
export type ComicRecord = { comic: Comic; complete: boolean };
export interface CloudStore {
  pendingComic(id?: string | null): Promise<ComicRecord | null>;
  comics(ids: string[]): Promise<ComicRecord[]>;
  pendingChapters(limit: number): Promise<Chapter[]>;
  commit(
    cursor: Cursor,
    bundles: ComicBundle[],
    release: boolean,
    requests?: number,
    finish?: boolean,
  ): Promise<void>;
}
