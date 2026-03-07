function getMetaDescription() {
  const meta = document.querySelector("meta[name='description'], meta[property='og:description']");
  return meta?.content?.trim() || null;
}

function getCanonicalUrl() {
  const canonical = document.querySelector("link[rel='canonical']");
  return canonical?.href?.trim() || null;
}

function getByline() {
  const meta = document.querySelector(
    "meta[name='author'], meta[property='article:author'], meta[name='twitter:creator']"
  );
  return meta?.content?.trim() || null;
}

function getPublishedTime() {
  const meta = document.querySelector(
    "meta[property='article:published_time'], meta[name='pubdate'], meta[name='date']"
  );
  if (meta?.content?.trim()) {
    return meta.content.trim();
  }

  const timeNode = document.querySelector("time[datetime]");
  return timeNode?.getAttribute("datetime")?.trim() || null;
}

function getSelectionText() {
  const selection = globalThis.getSelection?.()?.toString()?.trim() || "";
  return selection || null;
}

function collectArticleInput() {
  const textContent = document.body?.innerText?.trim() || "";

  return {
    url: globalThis.location?.href || null,
    title: document.title || null,
    lang: document.documentElement?.lang?.trim() || null,
    textContent: textContent || null,
    metaDescription: getMetaDescription(),
    canonicalUrl: getCanonicalUrl(),
    byline: getByline(),
    publishedTime: getPublishedTime(),
    selectionText: getSelectionText(),
    html: document.documentElement?.outerHTML || null,
    max_sentences: 3,
    max_chars: 320,
    maxPromptChars: 3600,
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
