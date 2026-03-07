import init, { process_article } from "./pkg/fire_summary.js";

const api = globalThis.browser ?? globalThis.chrome;
const EMPTY_SUMMARY_TEXT = "尚未產生摘要。";
const CACHE_PREFIX = "summaryCache:";
const CACHE_INDEX_KEY = "__summaryCacheIndex";
const DISCUSSION_CONTEXT_KEY = "__discussionContext";
const SESSION_API_KEY_KEY = "__sessionApiKey";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 20;
const CACHE_MAX_MARKDOWN_CHARS = 20_000;
const CACHE_MAX_TITLE_CHARS = 160;
const MAX_OUTPUT_TOKENS_LIMIT = 8192;
const DEFAULT_SETTINGS = {
  provider: "google_gemini",
  model: "gemini-3.1-flash-lite-preview",
  fallbackModel: "gemini-2.5-flash",
  apiKey: "",
  rememberApiKey: false,
  temperature: "0.3",
  topP: "",
  topK: "",
  maxOutputTokens: "",
  targetLanguage: "繁體中文",
  customPrompt: "",
  shortcut: "Alt+Shift+S",
  fontSize: "medium",
  titleFont: "pingfang",
  bodyFont: "systemSans",
  fontWeight: "500",
  lineHeight: "1.5",
  streamOutput: false,
  enableGoogleSearch: false,
  autoExportTxt: false,
  summaryCacheEnabled: true,
};
const FONT_FAMILY_MAP = {
  pingfang:
    '"PingFang TC", "PingFang SC", "PingFang HK", "Heiti TC", "Microsoft JhengHei", sans-serif',
  systemSans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  notoSansTc: '"Noto Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif',
  serif: '"Iowan Old Style", "Noto Serif TC", "Times New Roman", serif',
};
const FONT_FAMILY_KEYS = new Set(Object.keys(FONT_FAMILY_MAP));
const FONT_WEIGHT_KEYS = new Set(["400", "500", "600", "700"]);
const LINE_HEIGHT_KEYS = new Set(["1.4", "1.5", "1.6", "1.7", "1.8"]);
const DEFAULT_SYSTEM_PROMPT = [
  "You summarize webpage articles for browser extension users.",
  "Respond in {{targetLanguage}}.",
  "Return valid Markdown.",
  "The first non-empty line must be a level-1 heading with a short AI-generated title.",
  "After the title, provide the summary body in Markdown.",
  "Keep the result concise, high-signal, and easy to scan.",
  "Prefer short paragraphs or flat bullet lists when useful.",
  "Do not mention that you are an AI model.",
].join("\n");

const summarizeButton = document.getElementById("summarize-button");
const copyArticleButton = document.getElementById("copy-article-button");
const openSettingsButton = document.getElementById("open-settings-button");
const openDiscussionButton = document.getElementById("open-discussion-button");
const statusNode = document.getElementById("status");
const statusTextNode = statusNode.querySelector(".status-text");
const titleNode = document.getElementById("article-title");
const summaryNode = document.getElementById("summary");

let latestArticleText = "";
let latestArticleUrl = "";
let latestProcessedArticle = null;
let latestSummaryMarkdown = "";
let latestSummaryTitle = "";
let latestSummaryModel = "";
let summarizeInFlight = null;

async function ensureWasmReady() {
  if (!ensureWasmReady.ready) {
    ensureWasmReady.ready = init();
  }

  await ensureWasmReady.ready;
}

function setStatus(message, options = {}) {
  const { loading = false } = options;
  statusNode.classList.toggle("loading", loading);
  statusTextNode.textContent = message;
}

function setSummaryMessage(message) {
  titleNode.textContent = "";
  summaryNode.classList.remove("streaming");
  summaryNode.classList.add("empty");
  summaryNode.textContent = message;
}

function getPageTypeLabel(pageType) {
  switch (pageType) {
    case "article":
      return "文章頁";
    case "selection":
      return "選取內容";
    case "searchResults":
      return "搜尋結果頁";
    case "listingPage":
      return "列表頁";
    case "productPage":
      return "產品頁";
    case "discussionThread":
      return "討論串";
    case "sparsePage":
      return "內容稀少頁";
    case "genericPage":
      return "一般頁面";
    default:
      return "未知頁面";
  }
}

function formatQualityStatus(quality) {
  if (!quality || typeof quality !== "object") {
    return "";
  }

  const label = getPageTypeLabel(quality.pageType);
  return quality.safeToSummarize
    ? `頁面判斷：${label}`
    : `頁面判斷：${label}，可能不是典型文章`;
}

function applyFontSize(fontSize) {
  const nextSize = ["small", "medium", "large"].includes(fontSize) ? fontSize : "medium";
  document.body.dataset.fontSize = nextSize;
}

function pickSettingValue(value, allowedValues, fallback) {
  return allowedValues.has(value) ? value : fallback;
}

function applyTypographySettings(settings) {
  const root = document.documentElement;
  const titleFont = pickSettingValue(settings.titleFont, FONT_FAMILY_KEYS, DEFAULT_SETTINGS.titleFont);
  const bodyFont = pickSettingValue(settings.bodyFont, FONT_FAMILY_KEYS, DEFAULT_SETTINGS.bodyFont);
  const fontWeight = pickSettingValue(
    String(settings.fontWeight || ""),
    FONT_WEIGHT_KEYS,
    DEFAULT_SETTINGS.fontWeight
  );
  const lineHeight = pickSettingValue(
    String(settings.lineHeight || ""),
    LINE_HEIGHT_KEYS,
    DEFAULT_SETTINGS.lineHeight
  );

  root.style.setProperty("--summary-title-font-family", FONT_FAMILY_MAP[titleFont]);
  root.style.setProperty("--summary-body-font-family", FONT_FAMILY_MAP[bodyFont]);
  root.style.setProperty("--summary-font-weight", fontWeight);
  root.style.setProperty("--summary-line-height", lineHeight);
}

function parseGenerationNumber(value, options) {
  const { min, max, fallback, integer = false } = options;
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = integer ? Number.parseInt(trimmed, 10) : Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.trunc(clamped) : clamped;
}

function buildGenerationConfig(settings, defaultTemperature) {
  const generationConfig = {
    temperature: parseGenerationNumber(settings.temperature, {
      min: 0,
      max: 2,
      fallback: defaultTemperature,
    }),
  };

  if (String(settings.topP ?? "").trim()) {
    generationConfig.topP = parseGenerationNumber(settings.topP, {
      min: 0,
      max: 1,
      fallback: 1,
    });
  }

  if (String(settings.topK ?? "").trim()) {
    generationConfig.topK = parseGenerationNumber(settings.topK, {
      min: 1,
      max: 200,
      fallback: 40,
      integer: true,
    });
  }

  if (String(settings.maxOutputTokens ?? "").trim()) {
    generationConfig.maxOutputTokens = parseGenerationNumber(settings.maxOutputTokens, {
      min: 1,
      max: MAX_OUTPUT_TOKENS_LIMIT,
      fallback: 2048,
      integer: true,
    });
  }

  return generationConfig;
}

function buildGeminiTools(settings) {
  if (!settings.enableGoogleSearch) {
    return undefined;
  }

  return [{ google_search: {} }];
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function appendInlineContent(parent, text) {
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match = pattern.exec(text);

  while (match) {
    if (match.index > lastIndex) {
      parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      const link = document.createElement("a");
      link.href = match[2];
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = match[1];
      parent.append(link);
    } else if (match[3] !== undefined) {
      const code = document.createElement("code");
      code.textContent = match[3];
      parent.append(code);
    } else if (match[4] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[4];
      parent.append(strong);
    } else if (match[5] !== undefined) {
      const emphasis = document.createElement("em");
      emphasis.textContent = match[5];
      parent.append(emphasis);
    }

    lastIndex = pattern.lastIndex;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    parent.append(document.createTextNode(text.slice(lastIndex)));
  }
}

function appendInlineLines(parent, lines) {
  lines.forEach((line, index) => {
    appendInlineContent(parent, line);
    if (index < lines.length - 1) {
      parent.append(document.createElement("br"));
    }
  });
}

function parseHeadingLine(line) {
  const trimmed = String(line || "").trim();
  const headingMatch = trimmed.match(/^(#{1,4})\s*(.+)$/);
  if (!headingMatch) {
    return null;
  }

  return {
    level: Math.min(4, headingMatch[1].length),
    text: headingMatch[2].trim(),
  };
}

function renderBlock(block) {
  const trimmed = block.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/);
  const firstLine = lines[0]?.trim() || "";
  const remaining = lines.slice(1).join("\n").trim();
  const heading = parseHeadingLine(firstLine);
  if (heading) {
    const fragment = document.createDocumentFragment();
    const headingNode = document.createElement(`h${heading.level}`);
    appendInlineContent(headingNode, heading.text);
    fragment.append(headingNode);
    if (remaining) {
      fragment.append(renderMarkdown(remaining));
    }
    return fragment;
  }

  const codeMatch = trimmed.match(/^```[\w-]*\n?([\s\S]*?)```$/);
  if (codeMatch) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = codeMatch[1].trim();
    pre.append(code);
    return pre;
  }

  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    const list = document.createElement("ul");
    for (const line of lines) {
      const item = document.createElement("li");
      appendInlineContent(item, line.replace(/^[-*]\s+/, ""));
      list.append(item);
    }
    return list;
  }

  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    const list = document.createElement("ol");
    for (const line of lines) {
      const item = document.createElement("li");
      appendInlineContent(item, line.replace(/^\d+\.\s+/, ""));
      list.append(item);
    }
    return list;
  }

  if (lines.every((line) => /^>\s?/.test(line))) {
    const quote = document.createElement("blockquote");
    appendInlineLines(
      quote,
      lines.map((line) => line.replace(/^>\s?/, ""))
    );
    return quote;
  }

  const paragraph = document.createElement("p");
  appendInlineLines(paragraph, lines);
  return paragraph;
}

function renderMarkdown(markdown) {
  const fragment = document.createDocumentFragment();
  const blocks = markdown
    .trim()
    .split(/\n\s*\n/)
    .map((block) => renderBlock(block))
    .filter(Boolean);

  for (const block of blocks) {
    fragment.append(block);
  }

  return fragment;
}

function parseSummaryDocument(markdown, fallbackTitle) {
  const normalized = String(markdown || "").trim();
  if (!normalized) {
    return { aiTitle: fallbackTitle || "未取得標題", bodyMarkdown: "" };
  }

  const lines = normalized.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim() !== "");

  let aiTitle = fallbackTitle || "未取得標題";
  if (firstContentIndex >= 0 && /^#\s+/.test(lines[firstContentIndex])) {
    aiTitle = lines[firstContentIndex].replace(/^#\s+/, "").trim() || aiTitle;
    lines.splice(firstContentIndex, 1);
    if (lines[firstContentIndex] === "") {
      lines.splice(firstContentIndex, 1);
    }
  }

  return {
    aiTitle,
    bodyMarkdown: lines.join("\n").trim(),
  };
}

function setRenderedSummary(markdown, fallbackTitle) {
  const parsed = parseSummaryDocument(markdown, fallbackTitle);
  titleNode.textContent = parsed.aiTitle || fallbackTitle || "未取得標題";
  summaryNode.classList.remove("streaming");

  if (!parsed.bodyMarkdown) {
    summaryNode.classList.add("empty");
    summaryNode.textContent = EMPTY_SUMMARY_TEXT;
    return parsed;
  }

  summaryNode.classList.remove("empty");
  summaryNode.replaceChildren(renderMarkdown(parsed.bodyMarkdown));
  return parsed;
}

function renderStreamingPreview(markdown) {
  const normalized = String(markdown || "").replaceAll("\r\n", "\n");
  const lastFenceIndex = normalized.lastIndexOf("```");
  const hasOpenFence =
    lastFenceIndex !== -1 && normalized.slice(0, lastFenceIndex + 3).match(/```/g)?.length % 2 === 1;

  const previewSource = hasOpenFence ? normalized.slice(0, lastFenceIndex) : normalized;
  const fenceTail = hasOpenFence ? normalized.slice(lastFenceIndex) : "";
  const hasTrailingNewline = previewSource.endsWith("\n");
  const lines = previewSource.split("\n");
  const tailParts = [];

  if (!hasTrailingNewline && lines.length > 0) {
    tailParts.push(lines.pop());
  }

  if (fenceTail) {
    tailParts.push(fenceTail);
  }

  const fragment = document.createDocumentFragment();
  let paragraphLines = [];
  let listItems = [];
  let listType = "";
  let quoteLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }
    const paragraph = document.createElement("p");
    appendInlineLines(paragraph, paragraphLines);
    fragment.append(paragraph);
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0 || !listType) {
      return;
    }
    const list = document.createElement(listType);
    for (const itemText of listItems) {
      const item = document.createElement("li");
      appendInlineContent(item, itemText);
      list.append(item);
    }
    fragment.append(list);
    listItems = [];
    listType = "";
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) {
      return;
    }
    const quote = document.createElement("blockquote");
    appendInlineLines(quote, quoteLines);
    fragment.append(quote);
    quoteLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }

    const heading = parseHeadingLine(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      const headingNode = document.createElement(`h${heading.level}`);
      appendInlineContent(headingNode, heading.text);
      fragment.append(headingNode);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      flushList();
      quoteLines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(bulletMatch[1]);
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushQuote();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(orderedMatch[1]);
      continue;
    }

    flushList();
    flushQuote();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushQuote();

  return {
    fragment,
    tail: tailParts.join("\n").trim(),
  };
}

function setStreamingSummary(markdown, fallbackTitle) {
  const parsed = parseSummaryDocument(markdown, fallbackTitle);
  const preview = renderStreamingPreview(parsed.bodyMarkdown);
  titleNode.textContent = parsed.aiTitle || fallbackTitle || "未取得標題";
  summaryNode.classList.remove("empty");
  summaryNode.classList.add("streaming");

  const nodes = [];
  if (preview.fragment.childNodes.length > 0) {
    nodes.push(preview.fragment);
  }
  if (preview.tail) {
    const pre = document.createElement("pre");
    pre.className = "stream-tail";
    const code = document.createElement("code");
    code.textContent = preview.tail;
    pre.append(code);
    nodes.push(pre);
  }

  if (nodes.length === 0) {
    summaryNode.textContent = EMPTY_SUMMARY_TEXT;
    return;
  }

  summaryNode.replaceChildren(...nodes);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function storageGet(defaults) {
  const maybePromise = api.storage?.local?.get(defaults);
  if (maybePromise && typeof maybePromise.then === "function") {
    return maybePromise;
  }

  return new Promise((resolve, reject) => {
    api.storage.local.get(defaults, (result) => {
      const lastError = api.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(result);
    });
  });
}

function storageSet(value) {
  const maybePromise = api.storage?.local?.set(value);
  if (maybePromise && typeof maybePromise.then === "function") {
    return maybePromise;
  }

  return new Promise((resolve, reject) => {
    api.storage.local.set(value, () => {
      const lastError = api.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve();
    });
  });
}

function sessionStorageAvailable() {
  return Boolean(api.storage?.session);
}

function sessionStorageGet(defaults) {
  if (!sessionStorageAvailable()) {
    return Promise.resolve({ ...defaults });
  }

  const maybePromise = api.storage.session.get(defaults);
  if (maybePromise && typeof maybePromise.then === "function") {
    return maybePromise;
  }

  return new Promise((resolve, reject) => {
    api.storage.session.get(defaults, (result) => {
      const lastError = api.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(result);
    });
  });
}

function storageRemove(keys) {
  const maybePromise = api.storage?.local?.remove(keys);
  if (maybePromise && typeof maybePromise.then === "function") {
    return maybePromise;
  }

  return new Promise((resolve, reject) => {
    api.storage.local.remove(keys, () => {
      const lastError = api.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve();
    });
  });
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function buildCacheKey(processedArticle, settings, url) {
  const promptContext =
    processedArticle?.promptPayload?.compressedContext || processedArticle.cleaned_text || "";

  return `${CACHE_PREFIX}${hashString(
    JSON.stringify({
      version: 2,
      provider: settings.provider,
      model: settings.model,
      fallbackModel: settings.fallbackModel,
      temperature: settings.temperature,
      topP: settings.topP,
      topK: settings.topK,
      maxOutputTokens: settings.maxOutputTokens,
      enableGoogleSearch: settings.enableGoogleSearch,
      targetLanguage: settings.targetLanguage,
      customPrompt: settings.customPrompt,
      title: processedArticle.title || "",
      url,
      promptContext,
    })
  )}`;
}

function sanitizeCachedRecord(summaryRecord) {
  if (!summaryRecord || typeof summaryRecord !== "object") {
    return null;
  }

  const markdown = typeof summaryRecord.markdown === "string" ? summaryRecord.markdown.trim() : "";
  if (!markdown || markdown.length > CACHE_MAX_MARKDOWN_CHARS) {
    return null;
  }

  const aiTitle =
    typeof summaryRecord.aiTitle === "string"
      ? summaryRecord.aiTitle.trim().slice(0, CACHE_MAX_TITLE_CHARS)
      : "";
  const usedModel =
    typeof summaryRecord.usedModel === "string"
      ? summaryRecord.usedModel.trim().slice(0, CACHE_MAX_TITLE_CHARS)
      : "";
  const cachedAt = Number(summaryRecord.cachedAt);
  if (!Number.isFinite(cachedAt)) {
    return null;
  }

  return {
    markdown,
    aiTitle,
    usedModel,
    cachedAt,
  };
}

async function getCacheIndex() {
  const stored = await storageGet({ [CACHE_INDEX_KEY]: [] });
  return Array.isArray(stored[CACHE_INDEX_KEY]) ? stored[CACHE_INDEX_KEY] : [];
}

async function setCacheIndex(index) {
  await storageSet({ [CACHE_INDEX_KEY]: index });
}

async function pruneSummaryCache() {
  const now = Date.now();
  const index = await getCacheIndex();
  const validEntries = [];
  const keysToRemove = [];

  for (const entry of index) {
    if (!entry || typeof entry.key !== "string" || !entry.key.startsWith(CACHE_PREFIX)) {
      continue;
    }

    const touchedAt = Number(entry.touchedAt || entry.cachedAt || 0);
    const cachedAt = Number(entry.cachedAt || touchedAt || 0);
    if (!Number.isFinite(cachedAt) || now - cachedAt > CACHE_TTL_MS) {
      keysToRemove.push(entry.key);
      continue;
    }

    validEntries.push({
      key: entry.key,
      cachedAt,
      touchedAt: Number.isFinite(touchedAt) ? touchedAt : cachedAt,
    });
  }

  validEntries.sort((left, right) => right.touchedAt - left.touchedAt);
  const keptEntries = validEntries.slice(0, CACHE_MAX_ENTRIES);
  const overflowEntries = validEntries.slice(CACHE_MAX_ENTRIES);
  keysToRemove.push(...overflowEntries.map((entry) => entry.key));

  const uniqueKeysToRemove = [...new Set(keysToRemove)];
  if (uniqueKeysToRemove.length > 0) {
    await storageRemove(uniqueKeysToRemove);
  }

  await setCacheIndex(keptEntries);
  return keptEntries;
}

async function getCachedSummary(cacheKey) {
  const index = await pruneSummaryCache();
  const result = await storageGet({ [cacheKey]: null });
  const record = sanitizeCachedRecord(result[cacheKey]);
  if (!record) {
    await storageRemove(cacheKey);
    const filtered = index.filter((entry) => entry.key !== cacheKey);
    await setCacheIndex(filtered);
    return null;
  }

  const touchedAt = Date.now();
  const updatedIndex = index.map((entry) =>
    entry.key === cacheKey ? { ...entry, touchedAt } : entry
  );
  await setCacheIndex(updatedIndex);
  return record;
}

async function setCachedSummary(cacheKey, summaryRecord) {
  const record = sanitizeCachedRecord(summaryRecord);
  if (!record) {
    return;
  }

  const existingIndex = await pruneSummaryCache();
  const touchedAt = Date.now();
  const nextIndex = [
    { key: cacheKey, cachedAt: record.cachedAt, touchedAt },
    ...existingIndex.filter((entry) => entry.key !== cacheKey),
  ].slice(0, CACHE_MAX_ENTRIES);

  await storageSet({ [cacheKey]: record, [CACHE_INDEX_KEY]: nextIndex });
}

async function loadSettings() {
  const settings = await storageGet(DEFAULT_SETTINGS);
  if (settings.apiKey) {
    return settings;
  }

  const sessionValues = await sessionStorageGet({ [SESSION_API_KEY_KEY]: "" });
  return {
    ...settings,
    apiKey: sessionValues[SESSION_API_KEY_KEY] || "",
  };
}

async function saveDiscussionContext(context) {
  await storageSet({ [DISCUSSION_CONTEXT_KEY]: context });
}

async function getActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function requestArticle(tabId) {
  const response = await api.tabs.sendMessage(tabId, { type: "EXTRACT_ARTICLE" });
  if (!response?.ok) {
    throw new Error(response?.error || "content script did not return article data");
  }

  return response.article;
}

function isRestrictedUrl(url) {
  return url.startsWith("chrome://") || url.startsWith("about:");
}

async function loadProcessedArticleBundle() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    throw new Error("找不到目前分頁");
  }

  const url = tab.url || "";
  if (isRestrictedUrl(url)) {
    throw new Error("瀏覽器內建頁面不允許注入 content script");
  }

  const article = await requestArticle(tab.id);
  await ensureWasmReady();

  return {
    processedArticle: process_article(article),
    url,
  };
}

function buildSystemInstruction(settings) {
  if (settings.customPrompt) {
    return settings.customPrompt;
  }

  return DEFAULT_SYSTEM_PROMPT.replace(
    "{{targetLanguage}}",
    settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage
  );
}

function buildUserPrompt(processedArticle, url) {
  const promptPayload = processedArticle?.promptPayload || {};
  const articleHeader =
    typeof promptPayload.articleHeader === "string" ? promptPayload.articleHeader.trim() : "";
  const compressedContext =
    typeof promptPayload.compressedContext === "string"
      ? promptPayload.compressedContext.trim()
      : "";
  const keyPoints = Array.isArray(promptPayload.keyPoints)
    ? promptPayload.keyPoints.filter((item) => typeof item === "string" && item.trim())
    : [];
  const warnings = Array.isArray(processedArticle?.quality?.warnings)
    ? processedArticle.quality.warnings.filter(
        (item) => typeof item === "string" && item.trim()
      )
    : [];
  const parts = ["Summarize the following webpage article."];

  if (articleHeader) {
    parts.push(articleHeader);
  } else {
    parts.push(`Title: ${processedArticle.title || "Untitled"}`);
    parts.push(`URL: ${url}`);
    if (processedArticle.excerpt) {
      parts.push(`Excerpt: ${processedArticle.excerpt}`);
    }
  }

  if (keyPoints.length) {
    parts.push(`Pre-ranked key points:\n- ${keyPoints.join("\n- ")}`);
  }

  parts.push("High-signal article context:");
  parts.push(compressedContext || processedArticle.cleaned_text);

  if (warnings.length) {
    parts.push(`Extraction notes:\n- ${warnings.join("\n- ")}`);
  }

  return parts.join("\n\n");
}

function extractGeminiText(data) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    const text = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("");
    if (text) {
      return text;
    }
  }

  return "";
}

function mergeChunkText(current, incoming) {
  if (!incoming) {
    return current;
  }

  if (!current) {
    return incoming;
  }

  if (incoming.startsWith(current)) {
    return incoming;
  }

  if (current.startsWith(incoming)) {
    return current;
  }

  const maxOverlap = Math.min(current.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (current.endsWith(incoming.slice(0, overlap))) {
      return current + incoming.slice(overlap);
    }
  }

  return current + incoming;
}

function parseSseEvents(buffer) {
  const events = [];
  let working = buffer;
  let boundaryMatch = working.match(/\r?\n\r?\n/);

  while (boundaryMatch && boundaryMatch.index !== undefined) {
    const boundaryIndex = boundaryMatch.index;
    const rawEvent = working.slice(0, boundaryIndex);
    working = working.slice(boundaryIndex + boundaryMatch[0].length);
    const payload = rawEvent
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, "").trim())
      .join("\n");

    if (payload && payload !== "[DONE]") {
      events.push(payload);
    }

    boundaryMatch = working.match(/\r?\n\r?\n/);
  }

  return { events, rest: working };
}

function extractMarkdownFromSseText(rawText) {
  const dataBlocks = rawText.match(/^data:\s?.+$/gm) || [];
  let markdown = "";

  for (const block of dataBlocks) {
    const payload = block.replace(/^data:\s?/, "").trim();
    if (!payload || payload === "[DONE]") {
      continue;
    }

    try {
      markdown = mergeChunkText(markdown, extractGeminiText(JSON.parse(payload)));
    } catch {
      // Ignore malformed payloads and keep scanning.
    }
  }

  return markdown.trim();
}

async function summarizeWithGemini(processedArticle, settings, url, onPartial) {
  if (settings.provider !== "google_gemini") {
    throw new Error(`目前不支援的 provider: ${settings.provider}`);
  }

  if (!settings.apiKey) {
    throw new Error("請先到設定頁填入 Gemini API Key");
  }

  const model = settings.model || DEFAULT_SETTINGS.model;
  const action = settings.streamOutput ? "streamGenerateContent?alt=sse" : "generateContent";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`;
  const requestBody = {
    system_instruction: {
      parts: [{ text: buildSystemInstruction(settings) }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: buildUserPrompt(processedArticle, url) }],
      },
    ],
    generationConfig: buildGenerationConfig(settings, 0.3),
  };
  const tools = buildGeminiTools(settings);
  if (tools) {
    requestBody.tools = tools;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText);
      throw new Error(parsed?.error?.message || `Gemini API request failed (${response.status})`);
    } catch {
      throw new Error(errorText || `Gemini API request failed (${response.status})`);
    }
  }

  if (!settings.streamOutput) {
    const data = await response.json().catch(() => ({}));
    const markdown = extractGeminiText(data).trim();
    if (!markdown) {
      throw new Error("Gemini API 沒有回傳可用摘要");
    }

    return markdown;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const fallbackText = await response.text();
    const markdown = extractMarkdownFromSseText(fallbackText);
    if (markdown) {
      onPartial?.(markdown);
      return markdown;
    }

    throw new Error("Gemini stream 回應格式不是 event-stream");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const fallbackText = await response.text();
    const markdown = extractMarkdownFromSseText(fallbackText);
    if (markdown) {
      onPartial?.(markdown);
      return markdown;
    }

    throw new Error("Gemini streaming response 不可讀");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let markdown = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const { events, rest } = parseSseEvents(buffer);
    buffer = rest;

    for (const payload of events) {
      try {
        const parsed = JSON.parse(payload);
        markdown = mergeChunkText(markdown, extractGeminiText(parsed));
        if (markdown) {
          onPartial?.(markdown);
        }
      } catch {
        // Ignore malformed SSE chunks.
      }
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const { events } = parseSseEvents(`${buffer}\n\n`);
    for (const payload of events) {
      try {
        const parsed = JSON.parse(payload);
        markdown = mergeChunkText(markdown, extractGeminiText(parsed));
      } catch {
        // Ignore malformed trailing chunk.
      }
    }
  }

  if (!markdown.trim()) {
    const fallbackText = buffer.trim();
    const recovered = fallbackText ? extractMarkdownFromSseText(fallbackText) : "";
    if (recovered) {
      onPartial?.(recovered);
      return recovered;
    }

    throw new Error("Gemini stream 沒有回傳可用摘要");
  }

  return markdown.trim();
}

async function summarizeWithFallback(processedArticle, settings, url, onPartial) {
  const primaryModel = (settings.model || DEFAULT_SETTINGS.model).trim();
  const fallbackModel = (settings.fallbackModel || DEFAULT_SETTINGS.fallbackModel).trim();

  try {
    const markdown = await summarizeWithGemini(
      processedArticle,
      { ...settings, model: primaryModel },
      url,
      onPartial
    );
    return { markdown, usedModel: primaryModel, usedFallback: false };
  } catch (primaryError) {
    if (!fallbackModel || fallbackModel === primaryModel) {
      throw primaryError;
    }

    setStatus(`主模型失敗，改用 fallback：${fallbackModel}`);
    const markdown = await summarizeWithGemini(
      processedArticle,
      { ...settings, model: fallbackModel },
      url,
      onPartial
    );
    return { markdown, usedModel: fallbackModel, usedFallback: true };
  }
}

function sanitizeFilename(title) {
  const normalized = (title || "summary")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || "summary").slice(0, 80);
}

function downloadSummaryTxt(title, markdown) {
  const blob = new Blob([markdown], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${sanitizeFilename(title)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function maybeAutoExportSummary(settings) {
  if (!settings.autoExportTxt || !latestSummaryMarkdown) {
    return;
  }

  downloadSummaryTxt(latestSummaryTitle || "summary", latestSummaryMarkdown);
}

async function persistDiscussionContext(processedArticle, summaryMarkdown, summaryTitle, usedModel) {
  const promptPayload = processedArticle?.promptPayload || {};
  const quality = processedArticle?.quality || {};
  const contextId = hashString(
    JSON.stringify({
      version: 2,
      articleTitle: processedArticle.title || "",
      articleUrl: latestArticleUrl,
      summaryMarkdown,
      summaryTitle,
      usedModel,
      compressedContext: promptPayload.compressedContext || "",
    })
  );

  await saveDiscussionContext({
    contextId,
    articleTitle: processedArticle.title || "",
    articleUrl: latestArticleUrl,
    excerpt: processedArticle.excerpt || "",
    articleHeader: promptPayload.articleHeader || "",
    compressedContext: promptPayload.compressedContext || "",
    keyPoints: Array.isArray(promptPayload.keyPoints) ? promptPayload.keyPoints.slice(0, 5) : [],
    supportingBlocks: Array.isArray(promptPayload.supportingBlocks)
      ? promptPayload.supportingBlocks.slice(0, 6)
      : [],
    selectionStrategy: promptPayload.selectionStrategy || "",
    quality: quality && typeof quality === "object" ? quality : null,
    summaryMarkdown,
    summaryTitle,
    usedModel,
    savedAt: Date.now(),
  });
}

async function summarizeCurrentPage() {
  if (summarizeInFlight) {
    return summarizeInFlight;
  }

  setStatus("擷取頁面內容中...");
  summarizeButton.disabled = true;

  summarizeInFlight = (async () => {
    try {
      const [bundle, settings] = await Promise.all([loadProcessedArticleBundle(), loadSettings()]);
      applyFontSize(settings.fontSize);
      applyTypographySettings(settings);
      latestProcessedArticle = bundle.processedArticle;
      latestArticleText = bundle.processedArticle.cleaned_text || "";
      latestArticleUrl = bundle.url;
      const qualityStatus = formatQualityStatus(bundle.processedArticle.quality);

      let cacheKey = "";
      if (settings.summaryCacheEnabled) {
        cacheKey = buildCacheKey(bundle.processedArticle, settings, bundle.url);
        const cachedSummary = await getCachedSummary(cacheKey);
        if (cachedSummary?.markdown) {
          latestSummaryMarkdown = cachedSummary.markdown;
          const parsed = setRenderedSummary(cachedSummary.markdown, bundle.processedArticle.title);
          latestSummaryTitle = cachedSummary.aiTitle || parsed.aiTitle;
          latestSummaryModel = cachedSummary.usedModel || settings.model || DEFAULT_SETTINGS.model;
          await persistDiscussionContext(
            bundle.processedArticle,
            cachedSummary.markdown,
            latestSummaryTitle,
            latestSummaryModel
          );
          setStatus(
            [qualityStatus, `已命中快取：${latestSummaryModel}`].filter(Boolean).join("，")
          );
          maybeAutoExportSummary(settings);
          return;
        }
      }

      setStatus(
        [qualityStatus, settings.streamOutput ? "摘要串流中..." : "呼叫 Gemini API 中..."]
          .filter(Boolean)
          .join("，"),
        { loading: settings.streamOutput }
      );

      const { markdown, usedModel, usedFallback } = await summarizeWithFallback(
        bundle.processedArticle,
        settings,
        bundle.url,
        (partialMarkdown) => {
          latestSummaryMarkdown = partialMarkdown;
          setStreamingSummary(partialMarkdown, bundle.processedArticle.title);
        }
      );

      latestSummaryMarkdown = markdown;
      const parsed = setRenderedSummary(markdown, bundle.processedArticle.title);
      latestSummaryTitle = parsed.aiTitle;
      latestSummaryModel = usedModel;
      if (settings.summaryCacheEnabled && cacheKey) {
        await setCachedSummary(cacheKey, {
          markdown,
          aiTitle: parsed.aiTitle,
          usedModel,
          cachedAt: Date.now(),
        });
      }
      await persistDiscussionContext(
        bundle.processedArticle,
        markdown,
        latestSummaryTitle,
        usedModel
      );

      setStatus(
        [
          qualityStatus,
          `${usedFallback ? "fallback" : "來源"}：${usedModel}，共 ${
            bundle.processedArticle.stats.cleaned_chars
          } 字`,
        ]
          .filter(Boolean)
          .join("，")
      );
      maybeAutoExportSummary(settings);
    } catch (error) {
      latestSummaryMarkdown = "";
      latestSummaryTitle = "";
      latestSummaryModel = "";
      setSummaryMessage(error instanceof Error ? error.message : String(error));
      setStatus("摘要失敗");
    } finally {
      summarizeButton.disabled = false;
      summarizeInFlight = null;
    }
  })();

  return summarizeInFlight;
}

summarizeButton.addEventListener("click", async () => {
  summarizeButton.disabled = true;
  try {
    if (!latestSummaryMarkdown) {
      setStatus("準備摘要中...");
      await summarizeCurrentPage();
    }

    if (!latestSummaryMarkdown) {
      throw new Error("沒有可複製的摘要");
    }

    if (!latestSummaryMarkdown) {
      throw new Error("沒有可複製的摘要");
    }

    await copyText(latestSummaryMarkdown);
    setStatus(`已複製 Markdown 摘要，共 ${latestSummaryMarkdown.length} 字`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "複製摘要失敗");
  } finally {
    summarizeButton.disabled = false;
  }
});

copyArticleButton.addEventListener("click", async () => {
  copyArticleButton.disabled = true;
  try {
    if (!latestArticleText) {
      setStatus("擷取全文中...");
      const bundle = await loadProcessedArticleBundle();
      latestProcessedArticle = bundle.processedArticle;
      latestArticleText = bundle.processedArticle.cleaned_text || "";
      latestArticleUrl = bundle.url;
    }

    if (!latestArticleText) {
      throw new Error("沒有可複製的全文");
    }

    await copyText(latestArticleText);
    setStatus(`已複製全文，共 ${latestArticleText.length} 字`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "複製失敗");
  } finally {
    copyArticleButton.disabled = false;
  }
});

openSettingsButton.addEventListener("click", async () => {
  try {
    if (api.runtime?.openOptionsPage) {
      await api.runtime.openOptionsPage();
    } else if (api.tabs?.create && api.runtime?.getURL) {
      await api.tabs.create({ url: api.runtime.getURL("settings.html") });
    }

    window.close();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "無法開啟設定頁");
  }
});

openDiscussionButton.addEventListener("click", async () => {
  openDiscussionButton.disabled = true;
  try {
    if (!latestSummaryMarkdown) {
      await summarizeCurrentPage();
    }

    if (!latestSummaryMarkdown || !latestProcessedArticle) {
      throw new Error("還沒有可延伸的摘要內容");
    }

    await persistDiscussionContext(
      latestProcessedArticle,
      latestSummaryMarkdown,
      latestSummaryTitle || latestProcessedArticle.title,
      latestSummaryModel
    );

    if (api.tabs?.create && api.runtime?.getURL) {
      await api.tabs.create({ url: api.runtime.getURL("discussion.html") });
    } else if (api.runtime?.openOptionsPage) {
      await api.runtime.openOptionsPage();
    }
    window.close();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "無法開啟討論頁");
  } finally {
    openDiscussionButton.disabled = false;
  }
});

loadSettings()
  .then((settings) => {
    applyFontSize(settings.fontSize);
    applyTypographySettings(settings);
  })
  .catch(() => {
    applyFontSize(DEFAULT_SETTINGS.fontSize);
    applyTypographySettings(DEFAULT_SETTINGS);
  });

summarizeCurrentPage();
