import { randomUUID } from "node:crypto";
import { HttpClient, AccessError } from "../scraper/http";
import { ShinigamiScraper } from "../scraper/shinigami";
import { claimSchema, jobSchema } from "./model";
import { cloudRpc, persistentStore } from "./database";
import { processCloudWork } from "./engine";

export async function scrapeBatch(generation: string, runId: string) {
  "use step";
  const owner = randomUUID();
  const limit = Number(process.env.SCRAPER_DATABASE_LIMIT_MB ?? 400);
  const claim = claimSchema.parse(
    await cloudRpc("claim_scrape_batch", {
      p_generation: generation,
      p_owner: owner,
      p_run_id: runId,
      p_limit_mb: limit,
    }),
  );
  if (claim.kind === "stop") return { done: true, wait: 0 };
  if (claim.kind === "wait") return { done: false, wait: claim.seconds };
  try {
    const http = new HttpClient({
      delayMs: 1500,
      timeoutMs: 10000,
      retries: 1,
    });
    await http.checkWebsite();
    const result = await processCloudWork(
      persistentStore(generation, owner),
      new ShinigamiScraper(http),
      claim.job.cursor,
    );
    console.info("Cloud scrape batch completed", {
      phase: claim.job.cursor.phase,
      runId,
    });
    return { done: result.done, wait: 2 };
  } catch (error) {
    const blocked = error instanceof AccessError;
    const message =
      error instanceof Error ? error.message : "Unknown scraper failure";
    const job = jobSchema.parse(
      await cloudRpc("fail_scrape_batch", {
        p_generation: generation,
        p_owner: owner,
        p_message: message,
        p_blocked: blocked,
      }),
    );
    console.error("Cloud scrape batch stopped", {
      phase: claim.job.cursor.phase,
      blocked,
      status: job.status,
      message,
    });
    return { done: !job.enabled, wait: 30 };
  }
}
