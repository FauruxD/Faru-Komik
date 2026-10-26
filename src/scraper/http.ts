import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";
import { API, WEBSITE, sourceHeaders } from "./source";

// robots-parser is CommonJS; its declaration uses an ESM default export.
const robotsParser = createRequire(import.meta.url)(
  "robots-parser",
) as typeof import("robots-parser").default;

export class AccessError extends Error {}

export interface HttpOptions {
  delayMs?: number;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  fetcher?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
}

// One client, sequential requests, including robots.txt and retry attempts.
export class HttpClient {
  private lastRequest = 0;
  private readonly robots = new Map<string, ReturnType<typeof robotsParser>>();
  private readonly fetcher: typeof fetch;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly delay: number;
  private readonly agent: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly log: (message: string) => void;

  constructor(options: HttpOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.wait =
      options.wait ??
      (async (ms) => {
        await sleep(ms);
      });
    this.delay = options.delayMs ?? 1500;
    this.agent = options.userAgent ?? "KomikCatalogBot/0.1";
    this.timeout = options.timeoutMs ?? 25_000;
    this.retries = options.retries ?? 2;
    this.log = options.log ?? console.log;
  }

  private async request(url: string, robotsRequest = false): Promise<Response> {
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const remaining = this.delay - (Date.now() - this.lastRequest);
      if (remaining > 0) await this.wait(remaining);
      this.lastRequest = Date.now();
      let response: Response;
      try {
        response = await this.fetcher(url, {
          headers: sourceHeaders(this.agent),
          signal: AbortSignal.timeout(this.timeout),
          redirect: "manual",
        });
      } catch {
        if (attempt === this.retries)
          throw new Error(
            `Network request failed after ${attempt + 1} attempts: ${url}`,
          );
        await this.wait(1000 * 2 ** attempt);
        continue;
      }
      // RFC 9309 2.3.1.3: a 4xx robots response means rules are unavailable.
      // This applies only to robots.txt. Data endpoints still fail on 401/403;
      // rate limiting remains a cooldown even when requesting robots.txt.
      if (
        robotsRequest &&
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 429
      ) {
        await response.body?.cancel();
        return new Response(null, { status: response.status });
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new AccessError(
          `Source denied access (${response.status}): ${url}. Stopping without bypassing access controls.`,
        );
      }
      if (response.ok) {
        try {
          // Body streams can fail after headers arrive, especially on large lists.
          const body = await response.text();
          const headers = new Headers(response.headers);
          headers.delete("content-encoding");
          headers.delete("content-length");
          return new Response(body, { status: response.status, headers });
        } catch {
          if (attempt === this.retries)
            throw new Error(
              `Response body incomplete after ${attempt + 1} attempts: ${url}`,
            );
          await this.wait(1000 * 2 ** attempt);
          continue;
        }
      }
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < this.retries
      ) {
        const raw = response.headers.get("retry-after");
        const seconds = raw === null ? NaN : Number(raw);
        const waitMs =
          raw === null
            ? 1000 * 2 ** attempt
            : Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(raw) - Date.now();
        await response.body?.cancel();
        if (!Number.isFinite(waitMs) || waitMs > 60_000)
          throw new AccessError(
            "Source requested a long cooldown. Retry this run later.",
          );
        await this.wait(Math.max(this.delay, waitMs));
        continue;
      }
      await response.body?.cancel();
      if (response.status === 429) {
        throw new AccessError(
          `Source rate limit persists after retries: ${url}. Resume later.`,
        );
      }
      throw new Error(`HTTP ${response.status}: ${url}`);
    }
    throw new Error("Unreachable request state");
  }

  private async checkRobots(url: URL): Promise<void> {
    let rules = this.robots.get(url.origin);
    if (!rules) {
      const robotsUrl = new URL("/robots.txt", url.origin).href;
      const response = await this.request(robotsUrl, true);
      const text = response.ok ? await response.text() : "";
      if (/<(?:!doctype\s+html|html)\b/i.test(text)) {
        throw new AccessError(
          `robots.txt returned an HTML page or challenge: ${robotsUrl}`,
        );
      }
      rules = robotsParser(robotsUrl, text);
      this.robots.set(url.origin, rules);
      this.log(
        response.ok
          ? `robots.txt checked: ${url.origin}`
          : `robots.txt not provided (${response.status}): ${url.origin}`,
      );
    }
    if (rules.isDisallowed(url.href, this.agent))
      throw new AccessError(`robots.txt disallows: ${url.href}`);
    const crawlDelay = rules.getCrawlDelay(this.agent);
    if (crawlDelay && crawlDelay * 1000 > this.delay)
      await this.wait(crawlDelay * 1000);
  }

  async json(address: string): Promise<unknown> {
    const url = new URL(address);
    if (
      url.protocol !== "https:" ||
      url.origin !== API ||
      url.username ||
      url.password ||
      url.port
    ) {
      throw new Error(
        "Scraper only accepts the configured public HTTPS API host",
      );
    }
    await this.checkRobots(url);
    const response = await this.request(url.href);
    const text = await response.text();
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new AccessError(
        `Source returned a non-JSON page or challenge: ${url.href}`,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`Invalid JSON response: ${url.href}`);
    }
  }

  async checkWebsite(): Promise<void> {
    await this.checkRobots(new URL(WEBSITE));
  }
}
