import Link from "next/link";
import { Cover } from "./cover";
import { Icon } from "./icon";
import { chapterNumber, formatName, updateLabel } from "../lib/format";
import type { CatalogComic, SavedComic } from "../lib/types";

export function ComicCard({
  comic,
  showUpdate = false,
}: {
  comic: SavedComic & Partial<CatalogComic>;
  showUpdate?: boolean;
}) {
  return (
    <article className="comic-card">
      <Link
        href={`/komik/${comic.slug}`}
        className="comic-cover-link"
        aria-label={comic.title}
      >
        <Cover src={comic.cover_url} title={comic.title} />
        {comic.format && (
          <span className="format-badge">{formatName(comic.format)}</span>
        )}
      </Link>
      <div className="card-meta">
        <span>
          {comic.latest_chapter_number !== null
            ? `Chapter ${chapterNumber(comic.latest_chapter_number)}`
            : "Bacaan baru"}
        </span>
        {comic.rating !== null && comic.rating > 0 && (
          <span className="rating">
            <Icon name="star" width="14" height="14" />
            {comic.rating.toFixed(1)}
          </span>
        )}
      </div>
      <h3>
        <Link href={`/komik/${comic.slug}`}>{comic.title}</Link>
      </h3>
      {showUpdate && (
        <p className="update-date">
          <Icon name="clock" width="14" height="14" />
          {updateLabel(comic.source_updated_at ?? null)}
        </p>
      )}
    </article>
  );
}

export function ComicGrid({
  comics,
  showUpdate = false,
}: {
  comics: CatalogComic[];
  showUpdate?: boolean;
}) {
  return (
    <div className="comic-grid">
      {comics.map((comic) => (
        <ComicCard key={comic.id} comic={comic} showUpdate={showUpdate} />
      ))}
    </div>
  );
}
