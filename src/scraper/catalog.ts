import { comicSchema, type Comic } from "../data/schema";
import {
  normalizeComic,
  type ShinigamiScraper,
  type CatalogFilter,
} from "./shinigami";

export interface CatalogResult {
  comics: Comic[];
  expected_by_format: Record<string, number>;
  observed_by_format: Record<string, number>;
  complete: boolean;
}

// The list endpoint reports at most 1,000 matches. Its own format filters and
// ascending/descending ordering expose both ends of larger result sets.
export async function discoverCatalog(
  scraper: Pick<ShinigamiScraper, "catalog">,
  onPage: (comics: Comic[], label: string) => Promise<void>,
): Promise<CatalogResult> {
  const probe = await scraper.catalog(1, 100);
  const expected = probe.facet?.["taxonomy.Format.name"];
  if (!expected)
    throw new Error(
      "Catalog format counts are missing; cannot verify discovery completeness",
    );
  const collected = new Map<string, Comic>();
  const add = (items: typeof probe.data) => {
    for (const item of items) {
      if (!item.deleted_at) {
        const comic = comicSchema.parse(
          normalizeComic(item, new Date().toISOString()),
        );
        collected.set(comic.id, comic);
      }
    }
  };
  add(probe.data);
  const observed: Record<string, number> = {};
  for (const [formatName, count] of Object.entries(expected)) {
    const format = formatName.toLowerCase();
    if (!["manga", "manhwa", "manhua"].includes(format))
      throw new Error(`Unsupported catalog format: ${formatName}`);
    for (const order of ["desc", "asc"] as const) {
      let matching = [...collected.values()].filter(
        (comic) => comic.format === format,
      ).length;
      if (matching >= count) break;
      const filter: CatalogFilter = {
        format: format as NonNullable<CatalogFilter["format"]>,
        order,
      };
      for (let page = 1; ; page++) {
        const result = await scraper.catalog(page, 100, filter);
        if (result.meta.page !== page) throw new Error("Catalog page mismatch");
        add(result.data);
        await onPage(
          [...collected.values()],
          `${format} ${order} page ${page}/${result.meta.total_page}`,
        );
        matching = [...collected.values()].filter(
          (comic) => comic.format === format,
        ).length;
        if (
          page >= result.meta.total_page ||
          matching >= count ||
          result.data.length === 0
        )
          break;
      }
    }
    observed[formatName] = [...collected.values()].filter(
      (comic) => comic.format === format,
    ).length;
  }
  return {
    comics: [...collected.values()],
    expected_by_format: expected,
    observed_by_format: observed,
    complete: Object.entries(expected).every(
      ([format, count]) => (observed[format] ?? 0) >= count,
    ),
  };
}
