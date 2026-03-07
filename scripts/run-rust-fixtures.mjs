import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import init, {
  classify_page,
  extract_article_blocks,
  process_article,
} from "../extension/pkg/fire_summary.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "rust-core-v2");
const MANIFEST_PATH = path.join(FIXTURE_DIR, "manifest.json");
const WASM_PATH = path.join(REPO_ROOT, "extension", "pkg", "fire_summary_bg.wasm");
const REPORT_DIR = path.join(REPO_ROOT, "output", "rust-fixtures");
const REPORT_PATH = path.join(REPORT_DIR, "latest.json");

function formatNumber(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function summarizeTopBlocks(processedArticle) {
  const blocks = Array.isArray(processedArticle?.blocks) ? processedArticle.blocks : [];
  const rankedBlocks = Array.isArray(processedArticle?.rankedBlocks)
    ? processedArticle.rankedBlocks
    : [];
  const blockMap = new Map(blocks.map((block) => [block.id, block]));

  return rankedBlocks.slice(0, 3).map((ranked) => {
    const block = blockMap.get(ranked.blockId);
    return {
      id: ranked.blockId,
      score: ranked.score,
      reasons: ranked.reasons,
      preview: String(block?.text || "").slice(0, 120),
    };
  });
}

async function loadFixtures() {
  const manifestText = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestText);
  if (!Array.isArray(manifest)) {
    throw new Error("fixtures manifest must be an array");
  }

  return Promise.all(
    manifest.map(async (fixture) => {
      const html = await readFile(path.join(FIXTURE_DIR, fixture.file), "utf8");
      return {
        ...fixture,
        html,
      };
    })
  );
}

function buildArticleInput(fixture) {
  return {
    url: fixture.url || null,
    title: fixture.title || null,
    lang: fixture.lang || null,
    metaDescription: fixture.metaDescription || null,
    canonicalUrl: fixture.canonicalUrl || fixture.url || null,
    byline: fixture.byline || null,
    publishedTime: fixture.publishedTime || null,
    selectionText: fixture.selectionText || null,
    textContent: fixture.textContent || null,
    html: fixture.html || null,
    max_sentences: 3,
    max_chars: 320,
    maxPromptChars: 3600,
    maxPromptTokens: 900,
  };
}

function printFixtureReport(report) {
  console.log(`\n[${report.id}] ${report.title}`);
  console.log(
    `  pageType=${report.pageType} confidence=${formatNumber(report.confidence)} safe=${report.safeToSummarize}`
  );
  console.log(
    `  blocks=${report.blockCount} cleanedChars=${report.cleanedChars} promptTokens=${report.promptTokens} strategy=${report.selectionStrategy}`
  );

  if (report.warnings.length > 0) {
    console.log(`  warnings=${report.warnings.join(" | ")}`);
  }

  if (report.topBlocks.length > 0) {
    console.log("  topBlocks:");
    for (const block of report.topBlocks) {
      console.log(
        `    - ${block.id} score=${formatNumber(block.score)} reasons=${block.reasons.join(", ")}`
      );
      console.log(`      ${block.preview}`);
    }
  }

  if (report.failures.length > 0) {
    console.log(`  FAIL: ${report.failures.join(" | ")}`);
  } else {
    console.log("  OK");
  }
}

async function main() {
  const wasmBytes = await readFile(WASM_PATH);
  await init({ module_or_path: wasmBytes });

  const fixtures = await loadFixtures();
  const reports = [];

  for (const fixture of fixtures) {
    const input = buildArticleInput(fixture);
    const failures = [];

    try {
      const classification = classify_page(input);
      const extraction = extract_article_blocks(input);
      const processedArticle = process_article(input);

      if (fixture.expectedPageType && classification.pageType !== fixture.expectedPageType) {
        failures.push(
          `expected pageType=${fixture.expectedPageType}, got ${classification.pageType}`
        );
      }

      if (
        typeof fixture.expectedSafeToSummarize === "boolean" &&
        classification.safeToSummarize !== fixture.expectedSafeToSummarize
      ) {
        failures.push(
          `expected safeToSummarize=${fixture.expectedSafeToSummarize}, got ${classification.safeToSummarize}`
        );
      }

      if (
        Number.isFinite(fixture.minBlockCount) &&
        (extraction.blocks?.length || 0) < Number(fixture.minBlockCount)
      ) {
        failures.push(
          `expected minBlockCount=${fixture.minBlockCount}, got ${extraction.blocks?.length || 0}`
        );
      }

      if (
        Number.isFinite(fixture.minConfidence) &&
        Number(classification.confidence || 0) < Number(fixture.minConfidence)
      ) {
        failures.push(
          `expected minConfidence=${fixture.minConfidence}, got ${formatNumber(classification.confidence)}`
        );
      }

      reports.push({
        id: fixture.id,
        title: fixture.title || fixture.id,
        pageType: classification.pageType,
        confidence: classification.confidence,
        safeToSummarize: classification.safeToSummarize,
        warnings: Array.isArray(classification.warnings) ? classification.warnings : [],
        source: extraction.source,
        blockCount: extraction.blocks?.length || 0,
        cleanedChars: processedArticle.stats?.cleaned_chars || 0,
        promptTokens: processedArticle.stats?.prompt_tokens || 0,
        selectionStrategy: processedArticle.promptPayload?.selectionStrategy || "",
        topBlocks: summarizeTopBlocks(processedArticle),
        failures,
      });
    } catch (error) {
      reports.push({
        id: fixture.id,
        title: fixture.title || fixture.id,
        pageType: "error",
        confidence: null,
        safeToSummarize: false,
        warnings: [],
        source: "-",
        blockCount: 0,
        cleanedChars: 0,
        promptTokens: 0,
        selectionStrategy: "",
        topBlocks: [],
        failures: [
          error instanceof Error ? error.message : String(error),
        ],
      });
    }
  }

  console.log("Rust Core v2 fixture regression report");
  console.log(`Fixtures: ${reports.length}`);

  for (const report of reports) {
    printFixtureReport(report);
  }

  const failedReports = reports.filter((report) => report.failures.length > 0);
  const reportPayload = {
    generatedAt: new Date().toISOString(),
    fixtureCount: reports.length,
    failedCount: failedReports.length,
    passedCount: reports.length - failedReports.length,
    reports,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(reportPayload, null, 2)}\n`, "utf8");
  console.log(`\nSaved JSON report to ${REPORT_PATH}`);

  if (failedReports.length > 0) {
    console.error(`\nFixture regression failed: ${failedReports.length} fixture(s) mismatched.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAll fixture expectations matched.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
