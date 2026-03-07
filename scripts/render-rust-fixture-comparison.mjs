import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPORT_DIR = path.join(REPO_ROOT, "output", "rust-fixtures");
const COMPARISON_PATH = path.join(REPORT_DIR, "comparison.json");
const MARKDOWN_PATH = path.join(REPORT_DIR, "comparison.md");

async function main() {
  const raw = await readFile(COMPARISON_PATH, "utf8");
  const comparison = JSON.parse(raw);
  const lines = [
    "# Rust Fixture Baseline Comparison",
    "",
    `- Generated At: ${comparison.generatedAt || "-"}`,
    `- Baseline Generated At: ${comparison.baselineGeneratedAt || "-"}`,
    `- Fixtures: ${comparison.fixtureCount || 0}`,
    `- Regressions: ${comparison.regressionCount || 0}`,
    `- Notices: ${comparison.noticeCount || 0}`,
    "",
  ];

  for (const item of comparison.comparisons || []) {
    if (item.regressions.length === 0 && item.notices.length === 0) {
      continue;
    }

    lines.push(`## ${item.id}`);
    lines.push("");

    for (const regression of item.regressions) {
      lines.push(`- REGRESSION: ${regression}`);
    }
    for (const notice of item.notices) {
      lines.push(`- Notice: ${notice}`);
    }

    lines.push("");
  }

  if ((comparison.regressionCount || 0) === 0 && (comparison.noticeCount || 0) === 0) {
    lines.push("No regressions or notices.");
    lines.push("");
  }

  await writeFile(MARKDOWN_PATH, `${lines.join("\n")}\n`, "utf8");
  console.log(`Saved comparison Markdown report to ${MARKDOWN_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
