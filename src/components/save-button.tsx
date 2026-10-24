"use client";

import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Icon } from "./icon";
import { toggleBookmark, useLibrary } from "../lib/library";
import type { SavedComic } from "../lib/types";

export function SaveButton({ comic }: { comic: SavedComic }) {
  const library = useLibrary();
  const saved = library.bookmarks.some((item) => item.id === comic.id);
  const [error, setError] = useState(false);
  return (
    <div className="save-control">
      <Button
        variant="secondary"
        size="lg"
        aria-pressed={saved}
        onClick={() => setError(!toggleBookmark(comic))}
      >
        <Icon name={saved ? "check" : "bookmark"} />
        {saved ? "Tersimpan" : "Simpan komik"}
      </Button>
      {error && (
        <p className="field-error" role="status">
          Penyimpanan browser tidak tersedia.
        </p>
      )}
    </div>
  );
}
