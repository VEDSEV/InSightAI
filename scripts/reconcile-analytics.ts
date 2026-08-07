import { reconcilePhase2Fixture } from "./analytics/phase2-reconciliation.ts";

const report = await reconcilePhase2Fixture(process.cwd());
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") {
  process.exitCode = 1;
}
