# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Build WASM + staged extension builds
bash scripts/build-extension.sh

# Create release ZIPs (Chrome + Firefox)
bash scripts/package-extension.sh

# Firefox source package for reviewers
bash scripts/firefox-source-package.sh

# Run Rust fixture regression tests
bash scripts/run-rust-fixtures.sh

# Update regression baseline
node scripts/snapshot-rust-fixture-baseline.mjs

# Import new fixture from diagnostics draft
node scripts/import-rust-fixture.mjs /path/to/draft.json [--verify] [--snapshot-baseline]
```

**Prerequisites:** `wasm-pack`, `zip`, Rust toolchain with `wasm32-unknown-unknown` target.

## Architecture

### Two-Layer Design

- **Rust/WASM Core** (`src/lib.rs`): Article extraction, content normalization, block ranking, salience scoring, token budgeting, page classification, prompt packaging. Built with `wasm-bindgen`, `scraper`, `ego-tree`.
- **JavaScript Layer** (`extension/`): Browser API integration, content scripts, popup UI, settings, storage, Gemini API orchestration.

### Data Flow

1. Content script captures page HTML + metadata → JS
2. JS passes to `process_article(input: ArticleExtractionInput)` WASM function
3. Rust returns `ProcessedArticle` with blocks, ranked blocks, prompt payload, quality report
4. JS sends `promptPayload` to Gemini API
5. Response streams back to popup UI

### Key WASM Exports

- `process_article(input: JsValue) -> Result<JsValue, JsValue>` - Full pipeline
- `extract_article_blocks(html: &str) -> Result<JsValue, JsValue>` - Block extraction helper
- `classify_page(html: &str) -> Result<JsValue, JsValue>` - Page classification helper

### Extension Variants

- `extension/manifest.json` - Chrome Manifest V3
- `extension/manifest.firefox.json` - Firefox Manifest V2 (Desktop + Android single package)
- Staged builds: `build/chrome-extension/`, `build/firefox-extension/`

## Version Management

Version must be synced across three files: `Cargo.toml`, `extension/manifest.json`, `extension/manifest.firefox.json`. Use:

```bash
bash scripts/bump-version.sh patch  # or minor, major, or explicit version 1.2.3
```

## Regression Testing

Fixtures in `fixtures/rust-core-v2/` define test cases for extraction, classification, and ranking. Each fixture has expected outputs in `baseline.json`. Run regression with `bash scripts/run-rust-fixtures.sh` to compare against baseline.

## Loading Extension for Development

- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `build/chrome-extension/`
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `build/firefox-extension/manifest.json`

## Relevant Documentation

- `RUST_CORE_V2.md` - Detailed architecture and pipeline phases
- `README.md` - Build, package, release, and troubleshooting procedures
