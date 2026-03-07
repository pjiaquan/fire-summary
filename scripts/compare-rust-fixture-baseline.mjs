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
  topBlockOverlapRatio: 0.34,
};

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function formatNumber(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function resolveThresholds(compareConfig) {
  return {
    confidenceDrop: Number.isFinite(compareConfig?.confidenceDrop)
      ? Number(compareConfig.confidenceDrop)
      : THRESHOLDS.confidenceDrop,
    blockCountDrop: Number.isFinite(compareConfig?.blockCountDrop)
      ? Number(compareConfig.blockCountDrop)
      : THRESHOLDS.blockCountDrop,
    cleanedCharsDrop: Number.isFinite(compareConfig?.cleanedCharsDrop)
      ? Number(compareConfig.cleanedCharsDrop)
      : THRESHOLDS.cleanedCharsDrop,
    promptTokensIncrease: Number.isFinite(compareConfig?.promptTokensIncrease)
      ? Number(compareConfig.promptTokensIncrease)
      : THRESHOLDS.promptTokensIncrease,
    topBlockOverlapRatio: Number.isFinite(compareConfig?.topBlockOverlapRatio)
      ? Number(compareConfig.topBlockOverlapRatio)
      : THRESHOLDS.topBlockOverlapRatio,
  };
}

function compareFixture(report, baseline, compareConfig) {
  const regressions = [];
  const notices = [];
  const thresholds = resolveThresholds(compareConfig);

  if (baseline.pageType && report.pageType !== baseline.pageType) {
    regressions.push(`pageType changed from ${baseline.pageType} to ${report.pageType}`);
  }

  if (baseline.selectionStrategy && report.selectionStrategy !== baseline.selectionStrategy) {
    notices.push(
      `selectionStrategy changed from ${baseline.selectionStrategy} to ${report.selectionStrategy}`
    );
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
  if (confidenceDrop > thresholds.confidenceDrop) {
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
  if (blockCountDrop > thresholds.blockCountDrop) {
    regressions.push(
      `blockCount dropped by ${blockCountDrop} (${baseline.blockCount} -> ${report.blockCount})`
    );
  }

  const cleanedCharsDrop = Number(baseline.cleanedChars || 0) - Number(report.cleanedChars || 0);
  if (cleanedCharsDrop > thresholds.cleanedCharsDrop) {
    regressions.push(
      `cleanedChars dropped by ${cleanedCharsDrop} (${baseline.cleanedChars} -> ${report.cleanedChars})`
    );
  }

  const promptTokensIncrease =
    Number(report.promptTokens || 0) - Number(baseline.promptTokens || 0);
  if (promptTokensIncrease > thresholds.promptTokensIncrease) {
    regressions.push(
      `promptTokens increased by ${promptTokensIncrease} (${baseline.promptTokens} -> ${report.promptTokens})`
    );
  } else if (promptTokensIncrease > 80) {
    notices.push(
      `promptTokens increased by ${promptTokensIncrease} (${baseline.promptTokens} -> ${report.promptTokens})`
    );
  }

  const baselineTopBlockIds = Array.isArray(baseline.topBlockIds) ? baseline.topBlockIds : [];
  const reportTopBlockIds = Array.isArray(report.topBlocks)
    ? report.topBlocks.map((block) => block.id).filter(Boolean)
    : [];

  if (baselineTopBlockIds.length > 0 && reportTopBlockIds.length > 0) {
    const overlapCount = baselineTopBlockIds.filter((id) => reportTopBlockIds.includes(id)).length;
    const overlapRatio = overlapCount / baselineTopBlockIds.length;

    if (overlapRatio < thresholds.topBlockOverlapRatio) {
      regressions.push(
        `topBlock overlap dropped to ${formatNumber(overlapRatio)} (${overlapCount}/${baselineTopBlockIds.length})`
      );
    } else if (overlapRatio < 0.67) {
      notices.push(
        `topBlock overlap softened to ${formatNumber(overlapRatio)} (${overlapCount}/${baselineTopBlockIds.length})`
      );
    }
  }

  return {
    id: report.id,
    title: report.title,
    pageType: report.pageType,
    baselinePageType: baseline.pageType,
    regressions,
    notices,
    thresholds,
    report,
    baseline,
  };
}

async function main() {
  const reportPayload = await readJson(REPORT_PATH);
  const baselinePayload = await readJson(BASELINE_PATH);
  const manifestPayload = await readJson(path.join(REPO_ROOT, "fixtures", "rust-core-v2", "manifest.json"));
  const reportMap = new Map((reportPayload.reports || []).map((report) => [report.id, report]));
  const baselineEntries = Array.isArray(baselinePayload.fixtures)
    ? baselinePayload.fixtures
    : [];
  const compareConfigMap = new Map(
    (Array.isArray(manifestPayload) ? manifestPayload : []).map((fixture) => [
      fixture?.id,
      fixture?.compare || null,
    ])
  );

  const comparisons = baselineEntries.map((baseline) => {
    const report = reportMap.get(baseline.id);
    const compareConfig = compareConfigMap.get(baseline.id) || null;
    if (!report) {
      return {
        id: baseline.id,
        title: baseline.title || baseline.id,
        pageType: "missing",
        baselinePageType: baseline.pageType,
        regressions: ["fixture missing from latest report"],
        notices: [],
        thresholds: resolveThresholds(compareConfig),
        report: null,
        baseline,
      };
    }

    return compareFixture(report, baseline, compareConfig);
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
