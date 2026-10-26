import { comicSchema, type Comic } from "../data/schema";
import { normalizeComic, type ShinigamiScraper } from "../scraper/shinigami";
import { catalogScanSchema, type CatalogScan, type Cursor } from "./model";

const formats = ["manga", "manhwa", "manhua"] as const;
type Format = (typeof formats)[number];

function initialScan(facet: Record<string, number> | undefined): CatalogScan {
  if (!facet || !Object.keys(facet).length)
    throw new Error("Catalog format counts missing; cannot verify discovery");
  const expected = { manga: 0, manhwa: 0, manhua: 0 };
  for (const [name, count] of Object.entries(facet)) {
    const format = name.toLowerCase();
    if (!formats.includes(format as Format))
      throw new Error(`Unsupported catalog format: ${name}`);
    expected[format as Format] = count;
  }
  return catalogScanSchema.parse({
    expected,
    seen: { manga: [], manhwa: [], manhua: [] },
    formatIndex: 0,
    order: "desc",
    page: 1,
  });
}

// One REST catalog request per step. Every successful page advances the durable
// checkpoint; a failed page leaves the previous cursor intact for a retry.
export async function catalogPage(
  scraper: Pick<ShinigamiScraper, "catalog">,
  cursor: Extract<Cursor, { phase: "catalog" }>,
): Promise<{ cursor: Cursor; comics: Comic[] }> {
  const prior = cursor.scan;
  const format = prior ? formats[prior.formatIndex]! : undefined;
  const result = await scraper.catalog(
    prior?.page ?? 1,
    100,
    prior ? { format: format!, order: prior.order } : {},
  );
  if (result.meta.page !== (prior?.page ?? 1))
    throw new Error("Catalog page mismatch");
  if (result.data.length > 100)
    throw new Error("Catalog page exceeds the requested size");
  const scan = prior
    ? structuredClone(prior)
    : initialScan(result.facet?.["taxonomy.Format.name"]);
  const known = new Set(formats.flatMap((name) => scan.seen[name]));
  const fresh = new Map<string, Comic>();
  const at = new Date().toISOString();
  for (const item of result.data) {
    if (item.deleted_at) continue;
    const comic = comicSchema.parse(normalizeComic(item, at));
    if (!formats.includes(comic.format as Format))
      throw new Error("Catalog comic format missing or unsupported");
    if (!known.has(comic.id)) {
      scan.seen[comic.format as Format].push(comic.id);
      fresh.set(comic.id, comic);
      known.add(comic.id);
    }
  }
  while (
    scan.seen[formats[scan.formatIndex]!].length >=
    scan.expected[formats[scan.formatIndex]!]
  ) {
    if (scan.formatIndex === formats.length - 1) {
      return {
        cursor: { phase: "chapters", comicId: null, page: 1, seen: [] },
        comics: [...fresh.values()],
      };
    }
    scan.formatIndex++;
    scan.order = "desc";
    scan.page = 1;
  }
  if (prior && scan.formatIndex === prior.formatIndex) {
    const last =
      result.meta.page >= result.meta.total_page || !result.data.length;
    if (last && prior.order === "asc")
      throw new Error(
        "Catalog count incomplete after both sort windows; checkpoint preserved",
      );
    scan.order = last ? "asc" : prior.order;
    scan.page = last ? 1 : prior.page + 1;
  }
  return { cursor: { phase: "catalog", scan }, comics: [...fresh.values()] };
}
