"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

const links: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Beranda", icon: "home" },
  { href: "/jelajahi", label: "Jelajahi", icon: "compass" },
  { href: "/koleksi", label: "Koleksiku", icon: "bookmark" },
];
export function SiteNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      className={mobile ? "mobile-nav" : "desktop-nav"}
      aria-label={mobile ? "Navigasi mobile" : "Navigasi utama"}
    >
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={
            (
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href)
            )
              ? "page"
              : undefined
          }
        >
          <Icon name={link.icon} />
          <span>{link.label}</span>
        </Link>
      ))}
    </nav>
  );
}
