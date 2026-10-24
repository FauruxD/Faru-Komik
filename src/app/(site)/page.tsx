import Link from "next/link";
import { LinkButton } from "@cloudflare/kumo/components/button";
import { homeCatalog } from "../../lib/catalog";
import { number, formatName } from "../../lib/format";
import { Cover } from "../../components/cover";
import { ComicGrid } from "../../components/comic-card";
import { SectionHeading } from "../../components/section-heading";
import { Icon } from "../../components/icon";

export default async function HomePage() {
  const { picks, latest, ready, total } = await homeCatalog();
  const showcase = picks.slice(0, 3);
  return (
    <div className="container home-page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="hero-eyebrow">
            <span />
            Waktunya tenggelam dalam cerita
          </p>
          <h1 id="hero-title">
            Cerita bagus.
            <br />
            <em>Waktu untukmu.</em>
          </h1>
          <p className="hero-description">
            Dari petualangan yang bikin lupa waktu sampai kisah yang hangat di
            hati. Temukan dunia barumu, satu chapter setiap kali.
          </p>
          <div className="hero-actions">
            <LinkButton href="/jelajahi" variant="primary" size="lg">
              Temukan bacaanmu
              <Icon name="arrow" />
            </LinkButton>
            <Link href="#pilihan" className="hero-secondary">
              Lihat pilihan kami
              <Icon name="chevron" width="16" height="16" />
            </Link>
          </div>
          <div className="hero-note">
            <Icon name="book" width="18" height="18" />
            <span>
              <strong>{number(total)}</strong> cerita. Gratis, tanpa perlu akun.
            </span>
          </div>
        </div>
        <div className="hero-art" aria-label="Komik pilihan">
          <span className="hero-orbit" aria-hidden="true" />
          <span className="hero-spark" aria-hidden="true">
            ✳
          </span>
          {showcase.map((comic, index) => (
            <Link
              key={comic.id}
              href={`/komik/${comic.slug}`}
              className={`hero-book hero-book-${index}`}
            >
              <Cover
                src={comic.cover_url}
                title={comic.title}
                priority
                sizes="(max-width: 640px) 150px, 200px"
              />
              <span className="hero-book-caption">
                {formatName(comic.format)}
                <span>
                  <Icon name="star" width="14" height="14" />
                  {comic.rating?.toFixed(1)}
                </span>
              </span>
            </Link>
          ))}
          <div className="hero-art-caption">
            <span className="small-rule" />
            Cerita yang layak mengisi waktumu
          </div>
        </div>
      </section>
      <div className="genre-strip">
        <span>Ikuti seleramu</span>
        <div>
          {["Action", "Fantasy", "Romance", "Adventure", "Comedy", "Drama"].map(
            (genre) => (
              <Link key={genre} href={`/jelajahi?genre=${genre}`}>
                {genre}
                <Icon name="arrow" width="15" height="15" />
              </Link>
            ),
          )}
        </div>
      </div>
      <section className="content-section" id="pilihan">
        <SectionHeading
          title="Sulit berhenti di satu chapter"
          description="Cerita dengan rating tinggi untuk daftar bacaanmu."
          href="/jelajahi?sort=rating"
        />
        <ComicGrid comics={picks.slice(0, 6)} />
      </section>
      <section className="content-section latest-section">
        <SectionHeading
          title="Cerita yang terus berlanjut"
          description="Chapter terbaru dari dunia favoritmu."
          href="/jelajahi"
        />
        <ComicGrid comics={latest} showUpdate />
      </section>
      {ready.length > 0 && (
        <section className="ready-section">
          <div className="ready-copy">
            <span className="section-kicker">
              <Icon name="book" />
              Buka, baca, nikmati
            </span>
            <h2>
              Mulai cerita
              <br />
              pertamamu.
            </h2>
            <p>
              Punya beberapa menit luang? Chapter pertama dari cerita-cerita ini
              siap menemanimu.
            </p>
            <Link href="/jelajahi" className="text-link">
              Temukan lebih banyak
              <Icon name="arrow" />
            </Link>
          </div>
          <div className="ready-books">
            {ready.slice(0, 3).map((comic) => (
              <Link href={`/komik/${comic.slug}`} key={comic.id}>
                <div className="ready-cover">
                  <Cover src={comic.cover_url} title={comic.title} />
                </div>
                <h3>{comic.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="library-callout">
        <div>
          <Icon name="bookmark" width="25" height="25" />
          <div>
            <h2>Cerita favorit, selalu dekat.</h2>
            <p>
              Simpan komik ke koleksimu dan lanjutkan kapan saja di browser ini.
            </p>
          </div>
        </div>
        <LinkButton href="/koleksi" variant="secondary" size="lg">
          Buka koleksiku
          <Icon name="arrow" />
        </LinkButton>
      </section>
    </div>
  );
}
