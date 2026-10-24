export function number(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}
export function chapterNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(
    value,
  );
}
export function formatName(value: string | null): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Komik";
}
export function updateLabel(value: string | null): string {
  if (!value) return "Baru ditambahkan";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}
export type SearchValues = Record<string, string | string[] | undefined>;
function text(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}
export function catalogFilters(values: SearchValues) {
  const rawPage = Number(text(values.page));
  const sort = text(values.sort);
  const format = text(values.format);
  return {
    q: text(values.q).trim().slice(0, 100),
    format: ["manga", "manhwa", "manhua"].includes(format) ? format : "",
    genre: text(values.genre).slice(0, 60),
    sort: ["latest", "rating", "title"].includes(sort) ? sort : "latest",
    page:
      Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 500 ? rawPage : 1,
  };
}
export function catalogUrl(
  filters: Partial<ReturnType<typeof catalogFilters>>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (
      value &&
      !(key === "page" && value === 1) &&
      !(key === "sort" && value === "latest")
    )
      query.set(key, String(value));
  }
  return `/jelajahi${query.size ? `?${query}` : ""}`;
}
