// Example integration for the Rust/Wasm exports in this crate.
// The minimal extension skeleton in this repo builds to `extension/pkg/`.
// If you reuse this file elsewhere, update the import path for that environment.

import init, {
  summarize_article,
  extract_and_summarize,
} from "../pkg/fire_summary.js";

async function ensureWasmReady() {
  if (!ensureWasmReady.ready) {
    ensureWasmReady.ready = init();
  }
  await ensureWasmReady.ready;
}

function parseWithReadability() {
  if (typeof globalThis.Readability !== "function") {
    return null;
  }

  try {
    const clonedDocument = document.cloneNode(true);
    return new globalThis.Readability(clonedDocument).parse();
  } catch (error) {
    console.warn("Readability parse failed:", error);
    return null;
  }
}

export async function summarizeCurrentPage() {
  await ensureWasmReady();

  const article = parseWithReadability();
  if (article) {
    return summarize_article({
      title: article.title ?? null,
      textContent: article.textContent ?? null,
      excerpt: article.excerpt ?? null,
      html: null,
      max_sentences: 3,
      max_chars: 320,
    });
  }

  return {
    summary: extract_and_summarize(document.documentElement.outerHTML),
    source: "html-fallback",
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SUMMARIZE_PAGE") {
    return false;
  }

  summarizeCurrentPage()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    );

  return true;
});
