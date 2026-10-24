import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { fixtureBundle } from "./fixtures.js";

test("migration and transactional import: idempotence, rollback, manifest preservation, and public read-only access", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610230001_catalog.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const bundle = fixtureBundle();
    const importBundle = (value: unknown) =>
      db.query("select public.import_comic_bundle($1::jsonb)", [
        JSON.stringify(value),
      ]);
    await db.exec("set role service_role;");
    await importBundle(bundle);
    await importBundle(bundle);
    const counts = await db.query<{
      comics: number;
      chapters: number;
      pages: number;
    }>(
      "select (select count(*)::int from comics) as comics, (select count(*)::int from chapters) as chapters, (select count(*)::int from chapter_pages) as pages",
    );
    assert.deepEqual(counts.rows[0], { comics: 1, chapters: 1, pages: 2 });

    const bad = structuredClone(bundle);
    bad.comic.title = "Should roll back";
    bad.chapters[0]!.pages![1]!.position = 3;
    await assert.rejects(importBundle(bad), /contiguous/);
    const preserved = await db.query<{ title: string; pages: number }>(
      "select title, (select count(*)::int from chapter_pages) as pages from comics",
    );
    assert.equal(preserved.rows[0]?.title, bundle.comic.title);
    assert.equal(preserved.rows[0]?.pages, 2);

    const metadataOnly = {
      ...bundle,
      chapters: bundle.chapters.map((chapter) => ({
        ...chapter,
        pages: null,
        pages_fetched_at: null,
      })),
    };
    await importBundle(metadataOnly);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from chapter_pages",
        )
      ).rows[0]?.n,
      2,
    );

    const old = structuredClone(bundle);
    old.comic.title = "Old checkpoint";
    old.comic.scraped_at = "2026-01-01T00:00:00.000Z";
    await importBundle(old);
    assert.equal(
      (await db.query<{ title: string }>("select title from comics")).rows[0]
        ?.title,
      bundle.comic.title,
    );

    const wrongParent = structuredClone(bundle);
    wrongParent.chapters[0]!.comic_id = "00000000-0000-4000-8000-000000000000";
    await assert.rejects(importBundle(wrongParent), /parent/);

    await db.exec("reset role; set role anon;");
    assert.equal((await db.query("select * from comics")).rows.length, 1);
    await assert.rejects(
      db.query("update comics set title = 'Unauthorized'"),
      /permission denied/,
    );
    await assert.rejects(importBundle(bundle), /permission denied/);
    await db.exec("reset role; set role authenticated;");
    await assert.rejects(db.query("delete from chapters"), /permission denied/);
    await assert.rejects(importBundle(bundle), /permission denied/);
  } finally {
    await db.close();
  }
});
