"use client";

import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Icon } from "../components/icon";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="container standalone-state">
      <div className="empty-state">
        <div className="empty-icon">
          <Icon name="book" width="30" height="30" />
        </div>
        <h1>Perpustakaan sedang sulit dijangkau</h1>
        <p>Coba beberapa saat lagi. Cerita favoritmu masih menunggu.</p>
        <div className="error-actions">
          <Button variant="primary" size="lg" onClick={reset}>
            Coba lagi
          </Button>
          <LinkButton href="/" variant="secondary" size="lg">
            Ke beranda
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
