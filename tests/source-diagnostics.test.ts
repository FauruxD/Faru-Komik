import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseSource } from "../src/scraper/diagnostics";

test("source diagnostics distinguish browser challenges without returning payloads or cookies", async () => {
  const result = await diagnoseSource(async (input) => {
    assert.equal(
      String(input),
      "https://api.shngm.io/v1/manga/list?page=1&page_size=1&sort=latest",
    );
    return new Response(
      "<title>Just a moment...</title><script>private-challenge-token</script>",
      {
        status: 403,
        headers: {
          "cf-mitigated": "challenge",
          server: "cloudflare",
          "content-type": "text/html",
          "set-cookie": "private-cookie",
        },
      },
    );
  });
  assert.equal(result.classification, "browser_challenge");
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("source diagnostics distinguish API errors from successful public JSON responses", async () => {
  for (const status of [200, 403]) {
    const result = await diagnoseSource(async () =>
      Response.json({ data: [{ title: "not returned" }] }, { status }),
    );
    assert.equal(
      result.classification,
      status === 200 ? "api_available" : "api_error",
    );
    assert.equal(JSON.stringify(result).includes("not returned"), false);
  }
});

test("static Cloudflare access denials are not misclassified as browser challenges", async () => {
  const result = await diagnoseSource(
    async () =>
      new Response(
        "<title>Attention Required! | Cloudflare</title><h1>Sorry, you have been blocked</h1>",
        {
          status: 403,
          headers: { "content-type": "text/html", server: "cloudflare" },
        },
      ),
  );
  assert.equal(result.classification, "edge_access_denied");
});
