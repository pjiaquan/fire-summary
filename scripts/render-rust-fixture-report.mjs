import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPORT_DIR = path.join(REPO_ROOT, "output", "rust-fixtures");
const JSON_REPORT_PATH = path.join(REPORT_DIR, "latest.json");
const MARKDOWN_REPORT_PATH = path.join(REPORT_DIR, "latest.md");

function formatNumber(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function renderFixtureSection(report) {
  const lines = [];
  const status = Array.isArray(report.failures) && report.failures.length > 0 ? "FAIL" : "OK";

  lines.push(`## ${report.id} (${status})`);
  lines.push("");
  lines.push(`- Title: ${report.title}`);
  lines.push(`- Page Type: ${report.pageType}`);
  lines.push(`- Confidence: ${formatNumber(report.confidence)}`);
  lines.push(`- Safe To Summarize: ${report.safeToSummarize ? "true" : "false"}`);
  lines.push(`- Block Count: ${report.blockCount}`);
  lines.push(`- Cleaned Chars: ${report.cleanedChars}`);
  lines.push(`- Prompt Tokens: ${report.promptTokens}`);
  lines.push(`- Selection Strategy: ${report.selectionStrategy || "-"}`);

  if (Array.isArray(report.warnings) && report.warnings.length > 0) {
    lines.push("- Warnings:");
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (Array.isArray(report.topBlocks) && report.topBlocks.length > 0) {
    lines.push("- Top Blocks:");
    for (const block of report.topBlocks) {
      lines.push(
        `  - ${block.id}: score=${formatNumber(block.score)} | reasons=${(block.reasons || []).join(", ")}`
      );
      lines.push(`    ${block.preview}`);
    }
  }

  if (Array.isArray(report.failures) && report.failures.length > 0) {
    lines.push("- Failures:");
    for (const failure of report.failures) {
      lines.push(`  - ${failure}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

async function main() {
  const raw = await readFile(JSON_REPORT_PATH, "utf8");
  const payload = JSON.parse(raw);
  const reports = Array.isArray(payload.reports) ? payload.reports : [];

  const lines = [
    "# Rust Fixture Report",
    "",
    `- Generated At: ${payload.generatedAt || "-"}`,
    `- Fixtures: ${payload.fixtureCount ?? reports.length}`,
    `- Passed: ${payload.passedCount ?? "-"}`,
    `- Failed: ${payload.failedCount ?? "-"}`,
    "",
  ];

  for (const report of reports) {
    lines.push(renderFixtureSection(report));
  }

  await writeFile(MARKDOWN_REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Saved Markdown report to ${MARKDOWN_REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
