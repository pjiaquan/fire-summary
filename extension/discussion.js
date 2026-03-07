const api = globalThis.browser ?? globalThis.chrome;
const DISCUSSION_CONTEXT_KEY = "__discussionContext";
const DISCUSSION_STATE_KEY = "__discussionState";
const SESSION_API_KEY_KEY = "__sessionApiKey";
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

const discussionStatus = document.getElementById("discussion-status");
const contextModel = document.getElementById("context-model");
const contextTitle = document.getElementById("context-title");
const contextUrl = document.getElementById("context-url");
const contextSummary = document.getElementById("context-summary");
const messagesNode = document.getElementById("messages");
const composer = document.getElementById("composer");
const composerStatus = document.getElementById("composer-status");
const followupInput = document.getElementById("followup-input");
const exportButton = document.getElementById("export-button");
const sendButton = document.getElementById("send-button");

let currentContext = null;
let requestInFlight = null;
let messages = [];

function normalizeMessageText(text) {
  return String(text || "").trim().replace(/\r\n/g, "\n");
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

function storageSet(items) {
  const maybePromise = api.storage?.local?.set(items);
  if (maybePromise && typeof maybePromise.then === "function") {
    return maybePromise;
  }

  return new Promise((resolve, reject) => {
    api.storage.local.set(items, () => {
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
  return String(text)
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
  const blocks = String(markdown || "")
    .trim()
    .split(/\n\s*\n/)
    .map((block) => renderBlock(block))
    .filter(Boolean)
  for (const block of blocks) {
    fragment.append(block);
  }
  return fragment;
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

function setDiscussionStatus(text) {
  if (discussionStatus) {
    discussionStatus.textContent = text;
  }
}

function setComposerStatus(text) {
  composerStatus.textContent = text;
}

function updateComposerActions() {
  if (exportButton) {
    exportButton.disabled = messages.length === 0 || Boolean(requestInFlight);
  }
}

function setComposerLoading(isLoading) {
  composer.classList.toggle("loading", isLoading);
  sendButton.classList.toggle("loading", isLoading);
  sendButton.disabled = isLoading;
  followupInput.disabled = isLoading;
  followupInput.setAttribute("aria-busy", String(isLoading));
  updateComposerActions();
}

function renderMarkdownInto(node, markdown) {
  const normalized = String(markdown || "").trim();
  if (!normalized) {
    node.classList.add("empty");
    node.textContent = "目前沒有內容。";
    return;
  }

  node.classList.remove("empty");
  node.replaceChildren(renderMarkdown(normalized));
}

function renderMessageBody(message) {
  if (!message.streaming) {
    return renderMarkdown(message.content);
  }

  const preview = renderStreamingPreview(message.content);
  const fragment = document.createDocumentFragment();
  if (preview.fragment.childNodes.length > 0) {
    fragment.append(preview.fragment);
  }
  if (preview.tail) {
    const pre = document.createElement("pre");
    pre.className = "stream-tail";
    const code = document.createElement("code");
    code.textContent = preview.tail;
    pre.append(code);
    fragment.append(pre);
  }
  if (fragment.childNodes.length === 0) {
    const placeholder = document.createElement("p");
    placeholder.className = "stream-placeholder";
    placeholder.textContent = "思考中...";
    fragment.append(placeholder);
  }
  return fragment;
}

function renderMessages() {
  if (messages.length === 0) {
    messagesNode.classList.add("hidden");
    messagesNode.replaceChildren();
    updateComposerActions();
    return;
  }

  messagesNode.classList.remove("hidden");
  const articles = messages.map((message) => {
    const article = document.createElement("article");
    article.className = `message ${message.role}${message.streaming ? " streaming" : ""}`;

    const role = document.createElement("p");
    role.className = "message-role";
    role.textContent = message.role === "user" ? "You" : "Gemini";

    const body = document.createElement("div");
    body.className = "markdown";
    body.replaceChildren(renderMessageBody(message));

    article.append(role, body);
    return article;
  });
  messagesNode.replaceChildren(...articles);
  updateComposerActions();
}

async function loadContext() {
  const stored = await storageGet({ [DISCUSSION_CONTEXT_KEY]: null });
  return stored[DISCUSSION_CONTEXT_KEY];
}

async function loadDiscussionState() {
  const stored = await storageGet({ [DISCUSSION_STATE_KEY]: null });
  return stored[DISCUSSION_STATE_KEY];
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

async function saveDiscussionState() {
  const contextToken = currentContext?.contextId || String(currentContext?.savedAt || "");
  if (!contextToken) {
    return;
  }

  await storageSet({
    [DISCUSSION_STATE_KEY]: {
      contextToken,
      messages,
    },
  });
}

function removeLegacySummaryMessage(nextMessages, context) {
  if (!Array.isArray(nextMessages) || nextMessages.length === 0) {
    return [];
  }

  const [firstMessage, ...restMessages] = nextMessages;
  const summaryText = normalizeMessageText(context?.summaryMarkdown || "尚未找到摘要內容。");
  const firstMessageText = normalizeMessageText(firstMessage?.content);
  if (firstMessage?.role === "assistant" && firstMessageText === summaryText) {
    return restMessages;
  }

  return nextMessages;
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

function sanitizeFilename(title) {
  const normalized = (title || "discussion")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return (normalized || "discussion").slice(0, 80);
}

function downloadTextFile(title, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${sanitizeFilename(title)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function buildDiscussionExportText() {
  const lines = [];
  const title = currentContext?.summaryTitle || currentContext?.articleTitle || "Fire Summary Discussion";

  lines.push(title);
  lines.push("");

  if (currentContext?.articleUrl) {
    lines.push(`URL: ${currentContext.articleUrl}`);
    lines.push("");
  }

  lines.push("摘要");
  lines.push("");
  lines.push((currentContext?.summaryMarkdown || "尚未找到摘要內容。").trim());

  if (messages.length > 0) {
    lines.push("");
    lines.push("延伸討論");
    lines.push("");
    for (const message of messages) {
      lines.push(message.role === "user" ? "You:" : "Gemini:");
      lines.push(String(message.content || "").trim());
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

function buildConversationSystemInstruction(settings, context) {
  const targetLanguage = settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
  const basePrompt = settings.customPrompt
    ? settings.customPrompt
    : [
        "You continue browser-extension article discussions.",
        `Respond in ${targetLanguage}.`,
        "Use valid Markdown.",
        "Stay grounded in the article summary and conversation history.",
        "If the user asks for derivations, explore related topics, implications, comparisons, and practical next steps.",
        "Do not mention that you are an AI model.",
      ].join("\n");

  return [
    basePrompt,
    "",
    "Context article title:",
    context.articleTitle || "Untitled",
    "",
    "Context article URL:",
    context.articleUrl || "",
    "",
    "Existing summary:",
    context.summaryMarkdown || "",
    "",
    context.excerpt ? `Context excerpt:\n${context.excerpt}\n` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
      return text.trim();
    }
  }

  return "";
}

async function sendGeminiRequest(model, settings, body, onPartial) {
  const action = settings.streamOutput ? "streamGenerateContent?alt=sse" : "generateContent";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    throw new Error(data?.error?.message || text || `Gemini API request failed (${response.status})`);
  }

  if (!settings.streamOutput) {
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    const markdown = extractGeminiText(data);
    if (!markdown) {
      throw new Error("Gemini 沒有回傳可用內容");
    }

    return markdown;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const text = await response.text();
    const markdown = extractMarkdownFromSseText(text);
    if (markdown) {
      onPartial?.(markdown);
      return markdown;
    }

    throw new Error("Gemini stream 回應格式不是 event-stream");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    const markdown = extractMarkdownFromSseText(text);
    if (markdown) {
      onPartial?.(markdown);
      return markdown;
    }

    throw new Error("Gemini streaming response 不可讀");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let streamedMarkdown = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    const { events, rest } = parseSseEvents(buffer);
    buffer = rest;

    for (const payload of events) {
      try {
        const parsed = JSON.parse(payload);
        streamedMarkdown = mergeChunkText(streamedMarkdown, extractGeminiText(parsed));
        if (streamedMarkdown) {
          onPartial?.(streamedMarkdown);
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
        streamedMarkdown = mergeChunkText(streamedMarkdown, extractGeminiText(parsed));
      } catch {
        // Ignore malformed trailing chunk.
      }
    }
  }

  if (!streamedMarkdown.trim()) {
    const recovered = extractMarkdownFromSseText(buffer.trim());
    if (recovered) {
      onPartial?.(recovered);
      return recovered;
    }

    throw new Error("Gemini stream 沒有回傳可用內容");
  }

  return streamedMarkdown.trim();
}

async function askGemini(question, onPartial) {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    throw new Error("請先到設定頁填入 Gemini API Key");
  }

  const contents = [];
  for (const message of messages) {
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    });
  }

  contents.push({
    role: "user",
    parts: [{ text: question }],
  });

  const requestBody = {
    system_instruction: {
      parts: [{ text: buildConversationSystemInstruction(settings, currentContext) }],
    },
    contents,
    generationConfig: buildGenerationConfig(settings, 0.45),
  };
  const tools = buildGeminiTools(settings);
  if (tools) {
    requestBody.tools = tools;
  }

  const primaryModel = (settings.model || DEFAULT_SETTINGS.model).trim();
  const fallbackModel = (settings.fallbackModel || DEFAULT_SETTINGS.fallbackModel).trim();

  try {
    const markdown = await sendGeminiRequest(primaryModel, settings, requestBody, onPartial);
    return { markdown, usedModel: primaryModel };
  } catch (primaryError) {
    if (!fallbackModel || fallbackModel === primaryModel) {
      throw primaryError;
    }

    setComposerStatus(`主模型失敗，改用 fallback：${fallbackModel}`);
    onPartial?.("");
    const markdown = await sendGeminiRequest(
      fallbackModel,
      { ...settings, model: fallbackModel },
      requestBody,
      onPartial
    );
    return { markdown, usedModel: fallbackModel };
  }
}

async function submitQuestion() {
  if (requestInFlight) {
    return;
  }

  const question = followupInput.value.trim();
  if (!question) {
    setComposerStatus("請先輸入想延伸的問題。");
    return;
  }

  if (!currentContext) {
    setComposerStatus("還沒有摘要上下文，請先回 popup 跑一次摘要。");
    return;
  }

  const settings = await loadSettings();
  applyTypographySettings(settings);

  const userMessage = { role: "user", content: question };
  const assistantMessage = { role: "assistant", content: "", streaming: true };
  messages.push(userMessage);
  messages.push(assistantMessage);
  renderMessages();
  followupInput.value = "";
  setComposerLoading(true);
  setComposerStatus(settings.streamOutput ? "Gemini 串流回覆中..." : "Gemini 回覆中...");

  requestInFlight = (async () => {
    try {
      const { markdown, usedModel } = await askGemini(question, (partialMarkdown) => {
        assistantMessage.content = partialMarkdown;
        assistantMessage.streaming = true;
        renderMessages();
      });
      assistantMessage.content = markdown;
      assistantMessage.streaming = false;
      renderMessages();
      await saveDiscussionState();
      setComposerStatus(`已使用 ${usedModel} 回覆。`);
    } catch (error) {
      messages.pop();
      messages.pop();
      renderMessages();
      followupInput.value = question;
      await saveDiscussionState();
      setComposerStatus(error instanceof Error ? error.message : "延伸討論失敗");
    } finally {
      setComposerLoading(false);
      followupInput.focus();
      requestInFlight = null;
    }
  })();

  await requestInFlight;
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitQuestion();
});

followupInput.addEventListener("keydown", (event) => {
  if (event.isComposing) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    composer.requestSubmit();
  }
});

exportButton?.addEventListener("click", () => {
  if (messages.length === 0) {
    setComposerStatus("目前還沒有可匯出的延伸討論。");
    return;
  }

  downloadTextFile(
    `${currentContext?.summaryTitle || currentContext?.articleTitle || "discussion"} discussion`,
    buildDiscussionExportText()
  );
  setComposerStatus("已匯出目前延伸討論。");
});

async function initialize() {
  try {
    const settings = await loadSettings();
    applyTypographySettings(settings);
  } catch {
    applyTypographySettings(DEFAULT_SETTINGS);
  }

  currentContext = await loadContext();
  if (!currentContext) {
    setDiscussionStatus("目前沒有摘要上下文。請先在 popup 產生一次摘要。");
    contextModel.textContent = "";
    contextTitle.textContent = "尚未找到可延伸的摘要";
    contextUrl.textContent = "";
    contextSummary.classList.add("empty");
    contextSummary.textContent = "回到 popup 執行摘要後，再開啟這個頁面。";
    renderMessages();
    return;
  }

  setDiscussionStatus("你可以根據目前摘要繼續延伸相關話題。");
  contextModel.textContent = currentContext.usedModel
    ? `摘要模型：${currentContext.usedModel}`
    : "";
  contextTitle.textContent = currentContext.summaryTitle || currentContext.articleTitle || "未命名摘要";
  contextUrl.textContent = currentContext.articleUrl || "";
  renderMarkdownInto(contextSummary, currentContext.summaryMarkdown);
  const storedState = await loadDiscussionState();
  const contextToken = currentContext.contextId || String(currentContext.savedAt || "");
  if (
    storedState?.contextToken === contextToken &&
    Array.isArray(storedState.messages) &&
    storedState.messages.length > 0
  ) {
    const sanitizedMessages = removeLegacySummaryMessage(
      storedState.messages.filter(
        (message) =>
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string"
      ),
      currentContext
    );
    messages = sanitizedMessages;
    if (sanitizedMessages.length !== storedState.messages.length) {
      await saveDiscussionState();
    }
  } else {
    messages = [];
    await saveDiscussionState();
  }
  renderMessages();
}

initialize().catch((error) => {
  setDiscussionStatus(error instanceof Error ? error.message : "討論頁初始化失敗");
  renderMessages();
});
