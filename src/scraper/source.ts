export const WEBSITE = "https://11.shinigami.asia";
export const API = "https://api.shngm.io";
export const IMAGE_HOSTS = [
  "assets.shngm.id",
  "storage.shngm.id",
  "delivery.shngm.id",
  "mirror1.shngm.id",
  "mirror2.shngm.id",
];

export function sourceHeaders(userAgent: string): Record<string, string> {
  return {
    "User-Agent": userAgent,
    Accept: "application/json, text/plain;q=0.9",
    "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    Origin: WEBSITE,
    Referer: `${WEBSITE}/`,
  };
}
