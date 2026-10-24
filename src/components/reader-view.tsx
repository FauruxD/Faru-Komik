"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Icon } from "./icon";
import { chapterNumber } from "../lib/format";
import { rememberReading, savedComic } from "../lib/library";
import type { CatalogComic, CatalogChapter, ReaderPage } from "../lib/types";

type Neighbor = { id: string; number: number } | null;
interface ReaderProps {
  comic: CatalogComic;
  chapter: CatalogChapter;
  pages: ReaderPage[];
  previous: Neighbor;
  next: Neighbor;
}

function ReaderImage({
  page,
  first,
  title,
}: {
  page: ReaderPage;
  first: boolean;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="reader-sheet" id={`halaman-${page.position}`}>
      {failed ? (
        <div className="reader-image-error" role="status">
          <Icon name="book" width="28" height="28" />
          <p>Halaman {page.position} belum bisa dimuat.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          >
            Coba lagi
          </Button>
        </div>
      ) : (
        <>
          {/* Source strips have variable heights. Native loading preserves their original dimensions without guessing an aspect ratio or proxying full chapters through Vercel. */}
          <img
            key={attempt}
            src={page.image_url}
            alt={`${title}, halaman ${page.position}`}
            width="900"
            loading={first ? "eager" : "lazy"}
            fetchPriority={first ? "high" : "auto"}
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        </>
      )}
    </div>
  );
}

export function ReaderView({
  comic,
  chapter,
  pages,
  previous,
  next,
}: ReaderProps) {
  const [dark, setDark] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    rememberReading({
      comic: savedComic(comic),
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      readAt: new Date().toISOString(),
    });
  }, [comic, chapter.id, chapter.number]);
  return (
    <div
      className={`reader-shell${dark ? " reader-dark" : ""}${wide ? " reader-wide" : ""}`}
    >
      <header className="reader-header">
        <Link
          href={`/komik/${comic.slug}#chapters`}
          className="reader-back"
          aria-label={`Kembali ke ${comic.title}`}
        >
          <Icon name="left" />
        </Link>
        <div className="reader-heading">
          <Link href={`/komik/${comic.slug}`}>{comic.title}</Link>
          <span>
            Chapter {chapterNumber(chapter.number)}
            {pages.length > 0 && ` · ${pages.length} halaman`}
          </span>
        </div>
        <div className="reader-tools">
          <Button
            className="reader-tool width-tool"
            variant="ghost"
            shape="square"
            aria-label={wide ? "Gunakan lebar nyaman" : "Gunakan lebar penuh"}
            aria-pressed={wide}
            onClick={() => setWide(!wide)}
          >
            <Icon name="expand" />
          </Button>
          <Button
            className="reader-tool"
            variant="ghost"
            shape="square"
            aria-label={dark ? "Gunakan latar terang" : "Gunakan latar gelap"}
            aria-pressed={dark}
            onClick={() => setDark(!dark)}
          >
            <Icon name={dark ? "sun" : "moon"} />
          </Button>
          <Link
            href={`/komik/${comic.slug}#chapters`}
            className="reader-chapters"
            aria-label="Daftar chapter"
          >
            <Icon name="book" />
            <span>Daftar chapter</span>
          </Link>
        </div>
      </header>
      <main id="main" className="reader-main">
        <div className="reader-title">
          <p>{comic.title}</p>
          <h1>Chapter {chapterNumber(chapter.number)}</h1>
          {chapter.title && <p>{chapter.title}</p>}
          <span>Selamat membaca. Nikmati setiap halamannya.</span>
        </div>
        {pages.length ? (
          <>
            <div className="reader-pages">
              {pages.map((page, index) => (
                <ReaderImage
                  key={page.position}
                  page={page}
                  first={index === 0}
                  title={comic.title}
                />
              ))}
            </div>
            <div className="reader-end">
              <Icon name="check" width="28" height="28" />
              <h2>Satu chapter, satu perjalanan.</h2>
              <p>
                {next
                  ? "Masih penasaran? Ceritanya belum selesai."
                  : "Kamu sudah sampai di chapter terakhir yang tersedia."}
              </p>
              <LinkButton
                href={next ? `/baca/${next.id}` : `/komik/${comic.slug}`}
                variant="primary"
                size="lg"
              >
                {next
                  ? "Lanjut ke chapter berikutnya"
                  : "Kembali ke halaman komik"}
                <Icon name="arrow" />
              </LinkButton>
            </div>
          </>
        ) : (
          <div className="reader-empty">
            <div className="empty-icon">
              <Icon name="book" width="32" height="32" />
            </div>
            <h2>Halaman chapter ini belum tersedia</h2>
            <p>
              Kamu bisa mencoba chapter lain atau membuka chapter ini langsung
              di sumbernya.
            </p>
            <div>
              <LinkButton
                href={`/komik/${comic.slug}#chapters`}
                variant="primary"
                size="lg"
              >
                Pilih chapter lain
              </LinkButton>
              <LinkButton
                href={chapter.source_url}
                external
                variant="secondary"
                size="lg"
              >
                Buka di sumber
                <Icon name="external" width="16" height="16" />
              </LinkButton>
            </div>
          </div>
        )}
      </main>
      <nav className="reader-navigation" aria-label="Navigasi chapter">
        <LinkButton
          href={previous ? `/baca/${previous.id}` : "#"}
          disabled={!previous}
          variant="secondary"
          size="lg"
          aria-label="Chapter sebelumnya"
        >
          <Icon name="left" />
          <span>Sebelumnya</span>
        </LinkButton>
        <Link href={`/komik/${comic.slug}#chapters`} className="reader-current">
          Chapter {chapterNumber(chapter.number)}
        </Link>
        <LinkButton
          href={next ? `/baca/${next.id}` : "#"}
          disabled={!next}
          variant="primary"
          size="lg"
          aria-label="Chapter berikutnya"
        >
          <span>Berikutnya</span>
          <Icon name="arrow" />
        </LinkButton>
      </nav>
    </div>
  );
}
