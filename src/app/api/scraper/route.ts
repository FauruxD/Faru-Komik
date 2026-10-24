import { z } from "zod";
import { authorizedScraper } from "../../../cloud/authorization";
import { startScraper } from "../../../cloud/control";
import { cloudRpc, readJob } from "../../../cloud/database";
export const maxDuration = 30;
export async function GET(request: Request) {
  if (!authorizedScraper(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await readJob(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Scraper status failed", error);
    return Response.json(
      { error: "Unable to read scraper status" },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  if (!authorizedScraper(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await request.text();
  if (raw.length > 1024)
    return Response.json({ error: "Request too large" }, { status: 413 });
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = z
    .object({ action: z.enum(["start", "pause"]) })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return Response.json({ error: "Invalid action" }, { status: 400 });
  try {
    return Response.json(
      parsed.data.action === "pause"
        ? await cloudRpc("scrape_control", { p_action: "pause" })
        : await startScraper(true),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Scraper control failed", error);
    return Response.json(
      { error: "Unable to change scraper state" },
      { status: 503 },
    );
  }
}
