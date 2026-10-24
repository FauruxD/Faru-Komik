"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { useLibrary } from "../lib/library";
import { ComicCard } from "./comic-card";
import { EmptyState } from "./empty-state";
import { Icon } from "./icon";
import { chapterNumber } from "../lib/format";

export function LibraryContent() {
  const { bookmarks, history } = useLibrary();
  const [view, setView] = useState<"saved" | "history">("saved");
  return (
    <>
      <div className="library-tabs" aria-label="Tampilkan koleksi">
        <Button
          variant={view === "saved" ? "primary" : "ghost"}
          aria-pressed={view === "saved"}
          onClick={() => setView("saved")}
        >
          <Icon name="bookmark" />
          Tersimpan <span>{bookmarks.length}</span>
        </Button>
        <Button
          variant={view === "history" ? "primary" : "ghost"}
          aria-pressed={view === "history"}
          onClick={() => setView("history")}
        >
          <Icon name="clock" />
          Riwayat baca <span>{history.length}</span>
        </Button>
      </div>
      {view === "saved" ? (
        bookmarks.length ? (
          <div className="comic-grid">
            {bookmarks.map((comic) => (
              <ComicCard key={comic.id} comic={comic} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Ruang untuk cerita favoritmu"
            description="Tekan “Simpan komik” di halaman cerita. Pilihanmu akan tersimpan di browser ini, siap dibuka kapan saja."
            icon="bookmark"
          />
        )
      ) : history.length ? (
        <div className="comic-grid">
          {history.map((entry) => (
            <div key={entry.comic.id}>
              <ComicCard comic={entry.comic} />
              <Link
                className="continue-reading"
                href={`/baca/${entry.chapterId}`}
              >
                Lanjut chapter {chapterNumber(entry.chapterNumber)}
                <Icon name="arrow" width="16" height="16" />
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Perjalananmu dimulai di sini"
          description="Komik yang sudah kamu buka akan muncul di sini. Jadi, kamu bisa kembali ke chapter terakhir dengan mudah."
          icon="clock"
        />
      )}
      <p className="library-privacy">
        <Icon name="bookmark" width="16" height="16" />
        Koleksi dan riwayat tersimpan di browser ini, tanpa perlu akun.
      </p>
    </>
  );
}
