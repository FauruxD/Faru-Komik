import type { Metadata } from "next";
import { LibraryContent } from "../../../components/library-content";

export const metadata: Metadata = {
  title: "Koleksiku",
  robots: { index: false, follow: true },
};
export default function LibraryPage() {
  return (
    <div className="container library-page page-enter">
      <header className="page-heading">
        <p className="section-kicker">Rak bacaan pribadimu</p>
        <h1>
          Cerita favorit, <em>selalu dekat.</em>
        </h1>
        <p>Semua yang ingin kamu baca. Semua yang ingin kamu lanjutkan.</p>
      </header>
      <LibraryContent />
    </div>
  );
}
