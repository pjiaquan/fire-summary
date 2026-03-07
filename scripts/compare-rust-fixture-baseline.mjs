import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const BASELINE_PATH = path.join(REPO_ROOT, "fixtures", "rust-core-v2", "baseline.json");
const REPORT_DIR = path.join(REPO_ROOT, "output", "rust-fixtures");
const REPORT_PATH = path.join(REPORT_DIR, "latest.json");
const COMPARISON_PATH = path.join(REPORT_DIR, "comparison.json");

const THRESHOLDS = {
  confidenceDrop: 0.1,
  blockCountDrop: 1,
  cleanedCharsDrop: 120,
  promptTokensIncrease: 200,
};

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function formatNumber(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function compareFixture(report, baseline) {
  const regressions = [];
  const notices = [];

  if (baseline.pageType && report.pageType !== baseline.pageType) {
    regressions.push(`pageType changed from ${baseline.pageType} to ${report.pageType}`);
  }

  if (
    typeof baseline.safeToSummarize === "boolean" &&
    report.safeToSummarize !== baseline.safeToSummarize
  ) {
    regressions.push(
      `safeToSummarize changed from ${baseline.safeToSummarize} to ${report.safeToSummarize}`
    );
  }

  const confidenceDrop = Number(baseline.confidence || 0) - Number(report.confidence || 0);
  if (confidenceDrop > THRESHOLDS.confidenceDrop) {
    regressions.push(
      `confidence dropped by ${formatNumber(confidenceDrop)} (${formatNumber(
        baseline.confidence
      )} -> ${formatNumber(report.confidence)})`
    );
  } else if (confidenceDrop > 0.03) {
    notices.push(
      `confidence softened by ${formatNumber(confidenceDrop)} (${formatNumber(
        baseline.confidence
      )} -> ${formatNumber(report.confidence)})`
    );
  }

  const blockCountDrop = Number(baseline.blockCount || 0) - Number(report.blockCount || 0);
  if (blockCountDrop > THRESHOLDS.blockCountDrop) {
    regressions.push(
      `blockCount dropped by ${blockCountDrop} (${baseline.blockCount} -> ${report.blockCount})`
    );
  }

  const cleanedCharsDrop = Number(baseline.cleanedChars || 0) - Number(report.cleanedChars || 0);
  if (cleanedCharsDrop > THRESHOLDS.cleanedCharsDrop) {
    regressions.push(
      `cleanedChars dropped by ${cleanedCharsDrop} (${baseline.cleanedChars} -> ${report.cleanedChars})`
    );
  }

  const promptTokensIncrease =
    Number(report.promptTokens || 0) - Number(baseline.promptTokens || 0);
  if (promptTokensIncrease > THRESHOLDS.promptTokensIncrease) {
    regressions.push(
      `promptTokens increased by ${promptTokensIncrease} (${baseline.promptTokens} -> ${report.promptTokens})`
    );
  } else if (promptTokensIncrease > 80) {
    notices.push(
      `promptTokens increased by ${promptTokensIncrease} (${baseline.promptTokens} -> ${report.promptTokens})`
    );
  }

  return {
    id: report.id,
    title: report.title,
    pageType: report.pageType,
    baselinePageType: baseline.pageType,
    regressions,
    notices,
    report,
    baseline,
  };
}

async function main() {
  const reportPayload = await readJson(REPORT_PATH);
  const baselinePayload = await readJson(BASELINE_PATH);
  const reportMap = new Map((reportPayload.reports || []).map((report) => [report.id, report]));
  const baselineEntries = Array.isArray(baselinePayload.fixtures)
    ? baselinePayload.fixtures
    : [];

  const comparisons = baselineEntries.map((baseline) => {
    const report = reportMap.get(baseline.id);
    if (!report) {
      return {
        id: baseline.id,
        title: baseline.title || baseline.id,
        pageType: "missing",
        baselinePageType: baseline.pageType,
        regressions: ["fixture missing from latest report"],
        notices: [],
        report: null,
        baseline,
      };
    }

    return compareFixture(report, baseline);
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    baselineGeneratedAt: baselinePayload.generatedAt || null,
    thresholdConfig: THRESHOLDS,
    fixtureCount: comparisons.length,
    regressionCount: comparisons.filter((item) => item.regressions.length > 0).length,
    noticeCount: comparisons.reduce((count, item) => count + item.notices.length, 0),
    comparisons,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(COMPARISON_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("Rust Core v2 baseline comparison");
  console.log(`Fixtures: ${summary.fixtureCount}`);
  console.log(`Regressions: ${summary.regressionCount}`);
  console.log(`Notices: ${summary.noticeCount}`);
  console.log(`Saved comparison report to ${COMPARISON_PATH}`);

  for (const item of comparisons) {
    if (item.regressions.length === 0 && item.notices.length === 0) {
      continue;
    }

    console.log(`\n[${item.id}] ${item.title}`);
    for (const regression of item.regressions) {
      console.log(`  REGRESSION: ${regression}`);
    }
    for (const notice of item.notices) {
      console.log(`  Notice: ${notice}`);
    }
  }

  if (summary.regressionCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
