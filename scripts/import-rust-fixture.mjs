import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const FIXTURE_DIR = path.join(REPO_ROOT, "fixtures", "rust-core-v2");
const MANIFEST_PATH = path.join(FIXTURE_DIR, "manifest.json");
const WASM_PATH = path.join(REPO_ROOT, "extension", "pkg", "fire_summary_bg.wasm");

function usage() {
  console.error(
    "Usage: node scripts/import-rust-fixture.mjs <draft.json> [--validate] [--run-regression] [--verify] [--snapshot-baseline]"
  );
}

function normalizeString(value) {
  const text = String(value || "").trim();
  return text || null;
}

async function loadDraft(draftPath) {
  const raw = await readFile(draftPath, "utf8");
  return JSON.parse(raw);
}

function buildManifestEntry(draft) {
  const entry = draft?.manifestEntry;
  if (!entry || typeof entry !== "object") {
    throw new Error("Draft is missing manifestEntry.");
  }

  const normalized = {
    id: normalizeString(entry.id),
    file: normalizeString(entry.file),
    title: normalizeString(entry.title),
    url: normalizeString(entry.url),
    lang: normalizeString(entry.lang),
    expectedPageType: normalizeString(entry.expectedPageType),
    expectedSafeToSummarize: Boolean(entry.expectedSafeToSummarize),
  };

  if (!normalized.id || !normalized.file || !normalized.title || !normalized.expectedPageType) {
    throw new Error("Draft manifestEntry must include id, file, title, and expectedPageType.");
  }

  const metaDescription =
    normalizeString(entry.metaDescription) ||
    normalizeString(draft?.articleInput?.metaDescription);
  const textContent = normalizeString(draft?.articleInput?.textContent);

  if (metaDescription) {
    normalized.metaDescription = metaDescription;
  }
  if (textContent) {
    normalized.textContent = textContent;
  }

  return normalized;
}

async function updateManifest(nextEntry) {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);
  if (!Array.isArray(manifest)) {
    throw new Error("fixtures manifest must be an array");
  }

  const existingIndex = manifest.findIndex((entry) => entry?.id === nextEntry.id);
  if (existingIndex >= 0) {
    manifest[existingIndex] = nextEntry;
  } else {
    manifest.push(nextEntry);
  }

  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function writeFixtureHtml(filename, html) {
  const targetPath = path.join(FIXTURE_DIR, filename);
  await writeFile(targetPath, `${String(html || "").trim()}\n`, "utf8");
  return targetPath;
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`command failed with exit code ${code}: ${command} ${args.join(" ")}`));
    });
  });
}

function runNodeScript(scriptPath) {
  return runCommand(process.execPath, [scriptPath]);
}

function runNodeScriptWithArgs(scriptPath, args = []) {
  return runCommand(process.execPath, [scriptPath, ...args]);
}

async function ensureBuiltWasm() {
  try {
    await access(WASM_PATH);
  } catch {
    throw new Error(
      "Rust wasm package is missing. Run `bash scripts/build-extension.sh` before using --run-regression or --verify."
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const draftPath = args.find((arg) => !arg.startsWith("--"));
  const validateFixtures = args.includes("--validate") || args.includes("--verify");
  const runRegression = args.includes("--run-regression") || args.includes("--verify");
  const snapshotBaseline = args.includes("--snapshot-baseline");

  if (!draftPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const resolvedDraftPath = path.resolve(process.cwd(), draftPath);
  const draft = await loadDraft(resolvedDraftPath);
  const manifestEntry = buildManifestEntry(draft);
  const html = normalizeString(draft?.articleInput?.html);

  if (!html) {
    throw new Error("Draft is missing articleInput.html.");
  }

  const targetPath = await writeFixtureHtml(manifestEntry.file, html);
  await updateManifest(manifestEntry);

  console.log(`Imported fixture draft: ${manifestEntry.id}`);
  console.log(`- HTML: ${targetPath}`);
  console.log(`- Manifest: ${MANIFEST_PATH}`);

  if (validateFixtures) {
    console.log("- Validating fixture consistency...");
    await runNodeScriptWithArgs(path.join(REPO_ROOT, "scripts", "validate-rust-fixtures.mjs"), [
      "--allow-baseline-drift",
    ]);
  }

  if (runRegression) {
    await ensureBuiltWasm();
    console.log("- Running fixture regression report...");
    await runNodeScript(path.join(REPO_ROOT, "scripts", "run-rust-fixtures.mjs"));
    await runNodeScript(path.join(REPO_ROOT, "scripts", "render-rust-fixture-report.mjs"));
  }

  if (snapshotBaseline) {
    console.log("- Refreshing regression baseline...");
    await runNodeScript(path.join(REPO_ROOT, "scripts", "snapshot-rust-fixture-baseline.mjs"));
    console.log("- Re-validating fixture consistency with synced baseline...");
    await runNodeScript(path.join(REPO_ROOT, "scripts", "validate-rust-fixtures.mjs"));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
