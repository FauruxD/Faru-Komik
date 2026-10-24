import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LinkButton } from "@cloudflare/kumo/components/button";
import {
  getComic,
  comicChapters,
  firstChapter,
  relatedComics,
} from "../../../../lib/catalog";
import {
  chapterNumber,
  formatName,
  number,
  updateLabel,
  type SearchValues,
} from "../../../../lib/format";
import { Cover } from "../../../../components/cover";
import { Icon } from "../../../../components/icon";
import { SaveButton } from "../../../../components/save-button";
import { Pagination } from "../../../../components/pagination";
import { EmptyState } from "../../../../components/empty-state";
import { ComicGrid } from "../../../../components/comic-card";
import { SectionHeading } from "../../../../components/section-heading";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchValues>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const comic = await getComic((await params).slug);
  return comic
    ? {
        title: comic.title,
        description: comic.description.slice(0, 160),
        openGraph: {
          title: comic.title,
          description: comic.description.slice(0, 160),
          ...(comic.cover_url ? { images: [comic.cover_url] } : {}),
        },
      }
    : { title: "Komik tidak ditemukan" };
}
export default async function ComicPage({ params, searchParams }: Props) {
  const comic = await getComic((await params).slug);
  if (!comic) notFound();
  const values = await searchParams;
  const rawPage = Number(values.page);
  const page =
    Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 500
      ? rawPage
      : 1;
  const ascending = values.urutan === "awal";
  const [list, startId, related] = await Promise.all([
    comicChapters(comic.id, page, ascending),
    firstChapter(comic.id),
    relatedComics(comic.id, comic.genres[0]),
  ]);
  const chapterUrl = (nextPage: number) =>
    `/komik/${comic.slug}?page=${nextPage}${ascending ? "&urutan=awal" : ""}#chapters`;
  const save = {
    id: comic.id,
    slug: comic.slug,
    title: comic.title,
    cover_url: comic.cover_url,
    format: comic.format,
    rating: comic.rating,
    latest_chapter_number: comic.latest_chapter_number,
  };
  return (
    <div className="container detail-page page-enter">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/">Beranda</Link>
        <Icon name="chevron" width="14" height="14" />
        <Link href="/jelajahi">Jelajahi</Link>
        <Icon name="chevron" width="14" height="14" />
        <span>{comic.title}</span>
      </nav>
      <section className="comic-intro">
        <div className="detail-cover">
          <Cover
            src={comic.cover_url}
            title={comic.title}
            priority
            sizes="(max-width: 640px) 150px, 260px"
          />
        </div>
        <div className="comic-overview">
          <div className="intro-tags">
            <Link href={`/jelajahi?format=${comic.format ?? ""}`}>
              {formatName(comic.format)}
            </Link>
            {comic.release_year && <span>{comic.release_year}</span>}
            {comic.rating !== null && comic.rating > 0 && (
              <span className="rating">
                <Icon name="star" width="16" height="16" />
                {comic.rating.toFixed(1)} / 10
              </span>
            )}
          </div>
          <h1>{comic.title}</h1>
          {comic.alternative_title && (
            <p className="alternative-title">{comic.alternative_title}</p>
          )}
          <div className="comic-genres">
            {comic.genres.map((genre) => (
              <Link
                key={genre}
                href={`/jelajahi?genre=${encodeURIComponent(genre)}`}
              >
                {genre}
              </Link>
            ))}
          </div>
          <p className="intro-description">
            {comic.description
              ? comic.description.length > 320
                ? `${comic.description.slice(0, 320).trimEnd()}…`
                : comic.description
              : "Cerita baru menantimu. Mulai dari chapter pertama dan temukan dunianya."}
          </p>
          <div className="detail-actions">
            <LinkButton
              href={startId ? `/baca/${startId}` : "#chapters"}
              variant="primary"
              size="lg"
              disabled={!startId}
            >
              <Icon name="book" />
              Mulai membaca
            </LinkButton>
            <SaveButton comic={save} />
          </div>
          <p className="chapter-availability">
            <Icon name="book" width="16" height="16" />
            {number(list.total)} chapter tersedia<span>·</span>Update{" "}
            {updateLabel(comic.source_updated_at)}
          </p>
        </div>
      </section>
      <div className="detail-content">
        <aside className="story-info">
          <h2>Tentang cerita ini</h2>
          <dl>
            <div>
              <dt>Penulis</dt>
              <dd>{comic.authors.join(", ") || "Belum tersedia"}</dd>
            </div>
            <div>
              <dt>Ilustrator</dt>
              <dd>{comic.artists.join(", ") || "Belum tersedia"}</dd>
            </div>
            <div>
              <dt>Jenis</dt>
              <dd>{formatName(comic.format)}</dd>
            </div>
            {comic.release_year && (
              <div>
                <dt>Tahun rilis</dt>
                <dd>{comic.release_year}</dd>
              </div>
            )}
          </dl>
          {comic.description.length > 320 && (
            <details className="full-synopsis">
              <summary>
                Baca sinopsis lengkap
                <Icon name="chevron" width="16" height="16" />
              </summary>
              <p>{comic.description}</p>
            </details>
          )}
          <p className="story-note">
            Simpan cerita ini ke koleksimu agar mudah ditemukan lagi.
          </p>
        </aside>
        <section className="chapter-section" id="chapters">
          <div className="section-heading">
            <div>
              <h2>Daftar chapter</h2>
              <p>{number(list.total)} chapter untuk dijelajahi</p>
            </div>
            <Link
              className="order-link"
              href={`/komik/${comic.slug}?urutan=${ascending ? "terbaru" : "awal"}#chapters`}
            >
              {ascending ? "Dari awal" : "Terbaru dulu"}
              <Icon name="chevron" width="14" height="14" />
            </Link>
          </div>
          {list.chapters.length ? (
            <>
              <div className="chapter-list">
                {list.chapters.map((chapter) => (
                  <Link
                    key={chapter.id}
                    href={`/baca/${chapter.id}`}
                    className="chapter-row"
                  >
                    <span>
                      <span className="chapter-row-icon">
                        <Icon name="book" width="18" height="18" />
                      </span>
                      <span>
                        <strong>Chapter {chapterNumber(chapter.number)}</strong>
                        {chapter.title && (
                          <span className="chapter-title">{chapter.title}</span>
                        )}
                      </span>
                    </span>
                    <span className="chapter-row-end">
                      <span>{updateLabel(chapter.released_at)}</span>
                      <Icon name="chevron" width="17" height="17" />
                    </span>
                  </Link>
                ))}
              </div>
              <Pagination page={page} pages={list.pages} url={chapterUrl} />
            </>
          ) : (
            <EmptyState
              title={
                list.total
                  ? "Halaman chapter tidak ditemukan"
                  : "Chapter akan segera hadir"
              }
              description="Coba halaman lain atau temukan cerita lain untuk menemanimu hari ini."
              href={list.total ? `/komik/${comic.slug}#chapters` : "/jelajahi"}
              action={
                list.total ? "Kembali ke daftar chapter" : "Temukan cerita lain"
              }
            />
          )}
        </section>
      </div>
      {related.length > 0 && (
        <section className="content-section related-section">
          <SectionHeading
            title="Masih satu selera"
            description="Cerita lain yang mungkin kamu suka."
          />
          <ComicGrid comics={related} />
        </section>
      )}
    </div>
  );
}
