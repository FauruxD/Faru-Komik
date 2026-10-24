import { authorizedScraper } from "../../../../cloud/authorization";
import { startScraper } from "../../../../cloud/control";
export const maxDuration = 30;
export async function GET(request: Request) {
  if (!authorizedScraper(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await startScraper(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Scraper cron failed", error);
    return Response.json(
      { error: "Unable to start cloud scraper" },
      { status: 503 },
    );
  }
}
