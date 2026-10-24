import "server-only";
import { getRun, start } from "workflow/api";
import { z } from "zod";
import { cloudRpc, readJob } from "./database";
import { jobSchema } from "./model";
import { scrapeWorkflow } from "../workflows/scrape";

export async function startScraper(resume = false) {
  const current = await readJob();
  let recover = false;
  if (
    current.enabled &&
    current.status === "running" &&
    current.workflow_run_id
  ) {
    const run = getRun(current.workflow_run_id);
    const status = await run.status;
    if (status === "running" || status === "pending")
      return { started: false, job: current };
    recover = true;
  }
  const prepared = z.object({ launch: z.boolean(), job: jobSchema }).parse(
    await cloudRpc("scrape_control", {
      p_action: recover ? "recover" : resume ? "resume" : "begin",
    }),
  );
  if (!prepared.launch) return { started: false, job: prepared.job };
  const run = await start(scrapeWorkflow, [prepared.job.generation]);
  const job = jobSchema.parse(
    await cloudRpc("scrape_control", {
      p_action: "attach",
      p_generation: prepared.job.generation,
      p_run_id: run.runId,
    }),
  );
  return { started: true, job };
}
