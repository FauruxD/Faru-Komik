import type { Metadata } from "next";
import Link from "next/link";
import { Input } from "@cloudflare/kumo/components/input";
import { Button } from "@cloudflare/kumo/components/button";
import { listComics } from "../../../lib/catalog";
import {
  catalogFilters,
  catalogUrl,
  number,
  type SearchValues,
} from "../../../lib/format";
import { ComicGrid } from "../../../components/comic-card";
import { EmptyState } from "../../../components/empty-state";
import { Icon } from "../../../components/icon";
import { Pagination } from "../../../components/pagination";

export const metadata: Metadata = {
  title: "Jelajahi komik",
  description:
    "Cari dan jelajahi manga, manhwa, dan manhua. Pilih genre dan temukan cerita favoritmu.",
};
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchValues>;
}) {
  const filters = catalogFilters(await searchParams);
  const result = await listComics(filters);
  const filtered = Boolean(filters.q || filters.genre || filters.format);
  return (
    <div className="container browse-page page-enter">
      <header className="page-heading">
        <p className="section-kicker">Perpustakaan Faru</p>
        <h1>
          Dunia baru, <em>tinggal pilih.</em>
        </h1>
        <p>Manga, manhwa, atau manhua. Ada cerita untuk setiap suasana.</p>
      </header>
      <div className="browse-layout">
        <aside className="filter-sidebar">
          <form action="/jelajahi" className="filter-form">
            <div className="filter-heading">
              <h2>Temukan ceritamu</h2>
              {filtered && <Link href="/jelajahi">Reset</Link>}
            </div>
            <div className="filter-field">
              <label id="catalog-search-label" htmlFor="catalog-search">
                Cari judul
              </label>
              <Input
                key={filters.q}
                id="catalog-search"
                aria-labelledby="catalog-search-label"
                name="q"
                defaultValue={filters.q}
                placeholder="Judul yang kamu cari..."
                maxLength={100}
              />
            </div>
            <div className="filter-field">
              <label htmlFor="catalog-format">Jenis komik</label>
              <select
                key={filters.format}
                id="catalog-format"
                name="format"
                defaultValue={filters.format}
              >
                <option value="">Semua jenis</option>
                <option value="manga">Manga</option>
                <option value="manhwa">Manhwa</option>
                <option value="manhua">Manhua</option>
              </select>
            </div>
            <div className="filter-field">
              <label htmlFor="catalog-genre">Genre</label>
              <select
                key={filters.genre}
                id="catalog-genre"
                name="genre"
                defaultValue={filters.genre}
              >
                <option value="">Semua genre</option>
                {[
                  "Action",
                  "Adventure",
                  "Comedy",
                  "Drama",
                  "Fantasy",
                  "Romance",
                  "School Life",
                  "Shounen",
                  "Shoujo",
                  "Slice of Life",
                  "Sports",
                  "Supernatural",
                ].map((genre) => (
                  <option key={genre}>{genre}</option>
                ))}
              </select>
            </div>
            <div className="filter-field">
              <label htmlFor="catalog-sort">Urutkan</label>
              <select
                key={filters.sort}
                id="catalog-sort"
                name="sort"
                defaultValue={filters.sort}
              >
                <option value="latest">Update terbaru</option>
                <option value="rating">Rating tertinggi</option>
                <option value="title">Judul A–Z</option>
              </select>
            </div>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="filter-submit"
            >
              <Icon name="search" />
              Terapkan filter
            </Button>
          </form>
          <div className="filter-note">
            <Icon name="compass" />
            <p>Belum tahu mau baca apa? Coba genre yang jarang kamu pilih.</p>
          </div>
        </aside>
        <section className="browse-results" aria-label="Hasil pencarian komik">
          <div className="results-heading">
            <div>
              <h2>
                {filters.q
                  ? `Hasil untuk “${filters.q}”`
                  : filters.genre
                    ? `Cerita ${filters.genre}`
                    : "Semua komik"}
              </h2>
              <p>{number(result.total)} judul untuk dijelajahi</p>
            </div>
            {filtered && (
              <Link className="reset-link" href="/jelajahi">
                Hapus filter
                <Icon name="close" width="15" height="15" />
              </Link>
            )}
          </div>
          {result.comics.length ? (
            <>
              <ComicGrid comics={result.comics} />
              <Pagination
                page={filters.page}
                pages={result.pages}
                url={(page) => catalogUrl({ ...filters, page })}
              />
            </>
          ) : (
            <EmptyState
              title={
                result.total
                  ? "Halaman ini belum punya cerita"
                  : "Ceritanya belum ketemu"
              }
              description="Coba kata kunci yang lebih singkat atau pilih genre lainnya."
              href={catalogUrl({
                ...filters,
                page: 1,
                q: "",
                genre: "",
                format: "",
              })}
              action="Lihat semua komik"
              icon="search"
            />
          )}
        </section>
      </div>
    </div>
  );
}
