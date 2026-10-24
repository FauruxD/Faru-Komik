import Link from "next/link";
import { Input } from "@cloudflare/kumo/components/input";
import { Button } from "@cloudflare/kumo/components/button";
import { BrandMark, Icon } from "./icon";
import { SiteNavigation } from "./site-navigation";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Faru Komik, beranda">
      <BrandMark />
      <span>
        faru<span className="brand-suffix">komik</span>
      </span>
    </Link>
  );
}

export function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <SiteNavigation />
        <form action="/jelajahi" role="search" className="header-search">
          <Icon name="search" />
          <Input
            name="q"
            aria-label="Cari judul komik"
            placeholder="Cari cerita favoritmu..."
            maxLength={100}
          />
          <Button
            type="submit"
            variant="ghost"
            shape="square"
            aria-label="Cari komik"
          >
            <Icon name="arrow" />
          </Button>
        </form>
        <Link
          href="/jelajahi"
          className="mobile-search"
          aria-label="Cari komik"
        >
          <Icon name="search" />
        </Link>
        <Link href="/koleksi" className="header-library">
          <Icon name="bookmark" />
          <span>Koleksiku</span>
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Brand />
          <p>Selalu ada cerita untuk waktu luangmu.</p>
        </div>
        <div className="footer-links">
          <Link href="/jelajahi">Jelajahi komik</Link>
          <Link href="/koleksi">Koleksiku</Link>
          <span>Selamat membaca.</span>
        </div>
      </div>
    </footer>
  );
}
