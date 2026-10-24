import { EmptyState } from "../components/empty-state";

export default function NotFound() {
  return (
    <main id="main" className="container standalone-state">
      <p className="section-kicker">Faru Komik · 404</p>
      <EmptyState
        title="Cerita ini belum ketemu"
        description="Halaman yang kamu cari mungkin sudah berpindah. Masih ada banyak cerita lain yang menunggumu."
        href="/"
        action="Kembali ke beranda"
        icon="compass"
      />
    </main>
  );
}
