import { getWorkflowMetadata, sleep } from "workflow";
import { start } from "workflow/api";
import { scrapeBatch } from "../cloud/steps";

export async function scrapeWorkflow(generation: string) {
  "use workflow";
  const { workflowRunId } = getWorkflowMetadata();
  // Keep replay logs bounded; the successor continues the same DB checkpoint.
  for (let batch = 0; batch < 100; batch++) {
    const result = await scrapeBatch(generation, workflowRunId);
    if (result.done) return;
    await sleep(`${result.wait}s`);
  }
  await start(scrapeWorkflow, [generation]);
}
