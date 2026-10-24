import type { Metadata, Viewport } from "next";
import { DM_Sans, Lora } from "next/font/google";
import { Providers } from "../components/providers";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});
const serif = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  display: "swap",
});
export const metadata: Metadata = {
  title: {
    default: "Faru Komik — cerita bagus, waktu untukmu",
    template: "%s | Faru Komik",
  },
  description:
    "Jelajahi manga, manhwa, dan manhua berbahasa Indonesia. Temukan cerita favorit dan baca komik gratis di Faru Komik.",
  applicationName: "Faru Komik",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f7f3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      data-scroll-behavior="smooth"
      className={`${sans.variable} ${serif.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Langsung ke konten
        </a>
        <Providers>
          <div className="faru-app isolate">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
