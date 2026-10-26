import { API } from "./source";

interface SourceClient {
  fetch(
    url: URL,
    options: {
      method: "GET";
      headers: Headers;
      redirect: "manual";
      signal?: AbortSignal;
    },
  ): Promise<Pick<Response, "status" | "statusText" | "headers" | "body">>;
}
export async function createSourceTransport(
  injected?: SourceClient,
): Promise<typeof fetch> {
  const client =
    injected ??
    new (await import("impit")).Impit({
      browser: "chrome",
      timeout: 10000,
      followRedirects: false,
    });
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== API || url.username || url.password || url.port)
      throw new Error("Source transport only accepts the configured API");
    if (
      (init?.method ?? (input instanceof Request ? input.method : "GET")) !==
      "GET"
    )
      throw new Error("Source transport only supports public GET requests");
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
    if (headers.has("authorization") || headers.has("cookie"))
      throw new Error("Source credentials are not accepted by this transport");
    // Let the transport send the User-Agent belonging to its TLS/HTTP profile.
    headers.delete("user-agent");
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const response = await client.fetch(url, {
      method: "GET",
      headers,
      redirect: "manual",
      ...(signal ? { signal } : {}),
    });
    const normalized = new Headers(response.headers);
    normalized.delete("content-encoding");
    normalized.delete("content-length");
    return new Response(
      [204, 205, 304].includes(response.status) ? null : response.body,
      {
        status: response.status,
        statusText: response.statusText,
        headers: normalized,
      },
    );
  };
}
