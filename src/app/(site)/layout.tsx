import { Header, Footer } from "../../components/site-shell";
import { SiteNavigation } from "../../components/site-navigation";

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <SiteNavigation mobile />
    </>
  );
}
