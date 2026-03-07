import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPORT_PATH = path.join(REPO_ROOT, "output", "rust-fixtures", "latest.json");
const BASELINE_DIR = path.join(REPO_ROOT, "fixtures", "rust-core-v2");
const BASELINE_PATH = path.join(BASELINE_DIR, "baseline.json");

async function main() {
  const raw = await readFile(REPORT_PATH, "utf8");
  const report = JSON.parse(raw);
  const baseline = {
    generatedAt: new Date().toISOString(),
    sourceReportGeneratedAt: report.generatedAt || null,
    fixtureCount: report.fixtureCount || 0,
    fixtures: (report.reports || []).map((item) => ({
      id: item.id,
      title: item.title,
      pageType: item.pageType,
      safeToSummarize: item.safeToSummarize,
      confidence: item.confidence,
      blockCount: item.blockCount,
      cleanedChars: item.cleanedChars,
      promptTokens: item.promptTokens,
      selectionStrategy: item.selectionStrategy,
    })),
  };

  await mkdir(BASELINE_DIR, { recursive: true });
  await writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
  console.log(`Saved baseline snapshot to ${BASELINE_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
