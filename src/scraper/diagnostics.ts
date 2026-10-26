import { API, sourceHeaders } from "./source";

async function preview(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (bytes < 8192) {
      const part = await reader.read();
      if (part.done) break;
      const slice = part.value.subarray(0, 8192 - bytes);
      bytes += slice.length;
      text += decoder.decode(slice, { stream: true });
    }
    return text;
  } finally {
    await reader.cancel();
  }
}

// Fixed public endpoint only. Return transport evidence, never comic payloads,
// response cookies, challenge tokens, or credentials.
export async function diagnoseSource(fetcher: typeof fetch = fetch) {
  const response = await fetcher(
    `${API}/v1/manga/list?page=1&page_size=1&sort=latest`,
    {
      headers: sourceHeaders("KomikCatalogBot/0.1"),
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  const text = await preview(response);
  const contentType =
    response.headers.get("content-type")?.split(";")[0] ?? null;
  const mitigated = response.headers.get("cf-mitigated");
  const challenge =
    mitigated === "challenge" ||
    /<title>\s*Just a moment/i.test(text) ||
    /\/cdn-cgi\/challenge-platform\//i.test(text);
  const denied =
    /sorry,? you have been blocked|access denied|you are unable to access/i.test(
      text,
    );
  const cloudflareCode =
    text.match(/(?:error\s*(?:code)?[:\s]+)(1\d{3})\b/i)?.[1] ?? null;
  return {
    status: response.status,
    contentType,
    server: response.headers.get("server"),
    cloudflareMitigated: mitigated,
    cloudflareRay: response.headers.get("cf-ray"),
    cloudflareCode,
    classification:
      response.ok && contentType === "application/json"
        ? "api_available"
        : challenge
          ? "browser_challenge"
          : cloudflareCode || denied
            ? "edge_access_denied"
            : contentType === "application/json"
              ? "api_error"
              : "http_error",
  };
}
