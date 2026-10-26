import assert from "node:assert/strict";
import { test } from "node:test";
import { createSourceTransport } from "../src/scraper/transport";

test("source transport preserves API context, abort signals, and manual redirects", async () => {
  let calls = 0;
  const signal = AbortSignal.timeout(10000);
  const transport = await createSourceTransport({
    fetch: async (url, options) => {
      calls++;
      assert.equal(url.origin, "https://api.shngm.io");
      assert.equal(options.redirect, "manual");
      assert.equal(options.signal, signal);
      assert.equal(options.headers.get("origin"), "https://11.shinigami.asia");
      assert.equal(options.headers.get("user-agent"), null);
      return new Response("decoded fixture", {
        status: 302,
        headers: {
          location: "https://elsewhere.test/",
          "content-encoding": "gzip",
          "content-length": "99999",
        },
      });
    },
  });
  const response = await transport("https://api.shngm.io/v1/manga/list", {
    headers: { Origin: "https://11.shinigami.asia", "User-Agent": "test" },
    signal,
    redirect: "follow",
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("content-length"), null);
  assert.equal(await response.text(), "decoded fixture");
  assert.equal(calls, 1);
});

test("source transport rejects credentials, write methods, and destinations outside the API", async () => {
  let calls = 0;
  const transport = await createSourceTransport({
    fetch: async () => {
      calls++;
      return new Response("unused");
    },
  });
  for (const url of [
    "http://api.shngm.io/",
    "https://elsewhere.test/",
    "https://user:pass@api.shngm.io/",
    "https://api.shngm.io:8443/",
  ]) {
    await assert.rejects(transport(url));
  }
  await assert.rejects(transport("https://api.shngm.io/", { method: "POST" }));
  for (const key of ["cookie", "authorization"]) {
    await assert.rejects(
      transport(
        new Request("https://api.shngm.io/", {
          headers: { [key]: "secret fixture" },
        }),
      ),
    );
  }
  assert.equal(calls, 0);
});
