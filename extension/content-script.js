function getMetaDescription() {
  const meta = document.querySelector("meta[name='description'], meta[property='og:description']");
  return meta?.content?.trim() || null;
}

function collectArticleInput() {
  const textContent = document.body?.innerText?.trim() || "";

  return {
    title: document.title || null,
    textContent: textContent || null,
    excerpt: getMetaDescription(),
    html: textContent ? null : document.documentElement?.outerHTML || null,
    max_sentences: 3,
    max_chars: 320,
  };
}

const runtime = globalThis.browser?.runtime ?? globalThis.chrome?.runtime;

runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXTRACT_ARTICLE") {
    return false;
  }

  try {
    sendResponse({ ok: true, article: collectArticleInput() });
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return false;
});
