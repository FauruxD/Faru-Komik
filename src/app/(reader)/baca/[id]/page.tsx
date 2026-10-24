import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReader } from "../../../../lib/catalog";
import { chapterNumber } from "../../../../lib/format";
import { ReaderView } from "../../../../components/reader-view";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await getReader((await params).id);
  return result
    ? {
        title: `${result.comic.title} — chapter ${chapterNumber(result.chapter.number)}`,
        robots: { index: false, follow: true },
      }
    : { title: "Chapter tidak ditemukan" };
}
export default async function ReaderPage({ params }: Props) {
  const result = await getReader((await params).id);
  if (!result) notFound();
  return <ReaderView {...result} />;
}
