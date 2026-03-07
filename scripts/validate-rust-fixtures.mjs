import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "rust-core-v2");
const MANIFEST_PATH = path.join(FIXTURE_DIR, "manifest.json");
const BASELINE_PATH = path.join(FIXTURE_DIR, "baseline.json");

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const allowBaselineDrift = process.argv.includes("--allow-baseline-drift");
  const errors = [];
  const manifest = await readJson(MANIFEST_PATH);
  const baseline = await readJson(BASELINE_PATH);
  const fixtureFiles = await readdir(FIXTURE_DIR);

  if (!Array.isArray(manifest)) {
    throw new Error("fixtures manifest must be an array");
  }
  if (!Array.isArray(baseline?.fixtures)) {
    throw new Error("baseline fixtures must be an array");
  }

  const ids = new Set();
  const files = new Set();

  for (const entry of manifest) {
    const id = String(entry?.id || "").trim();
    const file = String(entry?.file || "").trim();
    const title = String(entry?.title || "").trim();
    const expectedPageType = String(entry?.expectedPageType || "").trim();

    if (!id) {
      errors.push("manifest entry is missing id");
      continue;
    }
    if (ids.has(id)) {
      errors.push(`duplicate manifest id: ${id}`);
    }
    ids.add(id);

    if (!file) {
      errors.push(`fixture ${id} is missing file`);
      continue;
    }
    if (files.has(file)) {
      errors.push(`duplicate fixture file: ${file}`);
    }
    files.add(file);

    if (!title) {
      errors.push(`fixture ${id} is missing title`);
    }
    if (!expectedPageType) {
      errors.push(`fixture ${id} is missing expectedPageType`);
    }

    if (!fixtureFiles.includes(file)) {
      errors.push(`fixture HTML is missing for ${id}: ${file}`);
    }
  }

  const htmlFiles = fixtureFiles.filter((name) => name.endsWith(".html"));
  for (const htmlFile of htmlFiles) {
    if (!files.has(htmlFile)) {
      errors.push(`orphan fixture HTML without manifest entry: ${htmlFile}`);
    }
  }

  const baselineIds = new Set();
  for (const entry of baseline.fixtures) {
    const id = String(entry?.id || "").trim();
    if (!id) {
      errors.push("baseline entry is missing id");
      continue;
    }
    if (baselineIds.has(id)) {
      errors.push(`duplicate baseline id: ${id}`);
    }
    baselineIds.add(id);

    if (!allowBaselineDrift && !ids.has(id)) {
      errors.push(`baseline entry missing from manifest: ${id}`);
    }
  }

  for (const id of ids) {
    if (!allowBaselineDrift && !baselineIds.has(id)) {
      errors.push(`manifest entry missing from baseline: ${id}`);
    }
  }

  if (errors.length > 0) {
    console.error("Rust fixture validation failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Rust fixture validation passed.");
  console.log(`- Manifest entries: ${manifest.length}`);
  console.log(`- HTML fixtures: ${htmlFiles.length}`);
  console.log(`- Baseline entries: ${baseline.fixtures.length}`);
  if (allowBaselineDrift) {
    console.log("- Baseline drift allowed for this validation run");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
