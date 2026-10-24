import Link from "next/link";
import { Icon } from "./icon";

export function Pagination({
  page,
  pages,
  url,
}: {
  page: number;
  pages: number;
  url: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Navigasi halaman">
      {page > 1 ? (
        <Link href={url(page - 1)} rel="prev" aria-label="Halaman sebelumnya">
          <Icon name="left" />
          <span>Sebelumnya</span>
        </Link>
      ) : (
        <span className="pagination-disabled">
          <Icon name="left" />
          <span>Sebelumnya</span>
        </span>
      )}
      <span className="pagination-count">
        Halaman <strong>{page}</strong> dari {pages}
      </span>
      {page < pages ? (
        <Link href={url(page + 1)} rel="next" aria-label="Halaman berikutnya">
          <span>Berikutnya</span>
          <Icon name="arrow" />
        </Link>
      ) : (
        <span className="pagination-disabled">
          <span>Berikutnya</span>
          <Icon name="arrow" />
        </span>
      )}
    </nav>
  );
}
