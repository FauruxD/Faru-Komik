import { authorizedScraper } from "../../../../cloud/authorization";
import { diagnoseSource } from "../../../../scraper/diagnostics";

export const maxDuration = 15;

export async function GET(request: Request) {
  if (!authorizedScraper(request))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await diagnoseSource(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Source diagnostics unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
