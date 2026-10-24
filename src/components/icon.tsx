import type { SVGProps } from "react";

export type IconName =
  | "search"
  | "arrow"
  | "left"
  | "chevron"
  | "book"
  | "bookmark"
  | "home"
  | "compass"
  | "star"
  | "clock"
  | "check"
  | "sun"
  | "moon"
  | "expand"
  | "close"
  | "external";
const paths: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </>
  ),
  left: (
    <>
      <path d="M20 12H5m6-6-6 6 6 6" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  book: (
    <>
      <path d="M12 6c-3-2-7-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-1-9 1Zm0 0v15" />
    </>
  ),
  bookmark: <path d="M6 3h12v18l-6-4-6 4V3Z" />,
  home: (
    <>
      <path d="m3 10 9-7 9 7v11h-6v-7H9v7H3V10Z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" />
    </>
  ),
  star: (
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" />
    </>
  ),
  moon: <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" />,
  expand: (
    <>
      <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  external: (
    <>
      <path d="M14 3h7v7m0-7L10 14M9 3H3v18h18v-6" />
    </>
  ),
};
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      fill="none"
      aria-hidden="true"
    >
      <rect width="34" height="34" rx="9" fill="currentColor" />
      <path d="M9 9h7v17l-7-4V9Z" fill="#F5F4ED" />
      <path d="m19 12 7-3v13l-7 4V12Z" fill="#C8D5A8" />
    </svg>
  );
}
