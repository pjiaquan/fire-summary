import init, {
  classify_page,
  extract_article_blocks,
  process_article,
} from "./pkg/fire_summary.js";

const api = globalThis.browser ?? globalThis.chrome;
const runButton = document.getElementById("run-diagnostics-button");
const copyJsonButton = document.getElementById("copy-json-button");
const statusNode = document.getElementById("status");
const pageTitleNode = document.getElementById("page-title");
const pageUrlNode = document.getElementById("page-url");
const pageTypeNode = document.getElementById("page-type");
const pageConfidenceNode = document.getElementById("page-confidence");
const pageSafeNode = document.getElementById("page-safe");
const pageSourceNode = document.getElementById("page-source");
const warningsListNode = document.getElementById("warnings-list");
const blockCountNode = document.getElementById("block-count");
const cleanedCharsNode = document.getElementById("cleaned-chars");
const promptTokensNode = document.getElementById("prompt-tokens");
const selectionStrategyNode = document.getElementById("selection-strategy");
const outlineListNode = document.getElementById("outline-list");
const blocksListNode = document.getElementById("blocks-list");
const articleHeaderNode = document.getElementById("article-header");
const compressedContextNode = document.getElementById("compressed-context");

let latestDiagnostics = null;

async function ensureWasmReady() {
  if (!ensureWasmReady.ready) {
    ensureWasmReady.ready = init();
  }

  await ensureWasmReady.ready;
}

function setStatus(message, tone = "") {
  statusNode.textContent = message;
  statusNode.classList.remove("status-ok", "status-warn");
  if (tone) {
    statusNode.classList.add(tone);
  }
}

function createStackCard(title, body, meta = "") {
  const article = document.createElement("article");
  article.className = "block-card";

  const titleNode = document.createElement("p");
  titleNode.className = "block-title";
  titleNode.textContent = title;

  const metaNode = document.createElement("p");
  metaNode.className = "block-meta";
  metaNode.textContent = meta;

  const bodyNode = document.createElement("p");
  bodyNode.className = "block-body";
  bodyNode.textContent = body;

  article.append(titleNode);
  if (meta) {
    article.append(metaNode);
  }
  article.append(bodyNode);
  return article;
}

function setStackContent(container, items, emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    container.classList.add("empty");
    container.textContent = emptyMessage;
    return;
  }

  container.classList.remove("empty");
  container.replaceChildren(...items);
}

async function getActiveTab() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isRestrictedUrl(url) {
  return String(url || "").startsWith("chrome://") || String(url || "").startsWith("about:");
}

async function requestArticle(tabId) {
  const response = await api.tabs.sendMessage(tabId, { type: "EXTRACT_ARTICLE" });
  if (!response?.ok) {
    throw new Error(response?.error || "content script did not return article data");
  }

  return response.article;
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

function renderWarnings(warnings) {
  const items = Array.isArray(warnings)
    ? warnings
        .filter((warning) => typeof warning === "string" && warning.trim())
        .map((warning, index) =>
          createStackCard(`Warning ${index + 1}`, warning, "Rust quality report")
        )
    : [];
  setStackContent(warningsListNode, items, "目前沒有 warning。");
}

function renderOutline(outline) {
  const items = Array.isArray(outline)
    ? outline.map((node) =>
        createStackCard(
          node.title || "Untitled section",
          `Heading level ${node.level || "?"}`,
          `blockId=${node.blockId || "-"}`
        )
      )
    : [];
  setStackContent(outlineListNode, items, "尚未取得 outline。");
}

function renderRankedBlocks(processedArticle) {
  const blocks = Array.isArray(processedArticle?.blocks) ? processedArticle.blocks : [];
  const rankedBlocks = Array.isArray(processedArticle?.rankedBlocks)
    ? processedArticle.rankedBlocks
    : [];
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const items = rankedBlocks.slice(0, 6).flatMap((ranked, index) => {
    const block = blockMap.get(ranked.blockId);
    if (!block) {
      return [];
    }

    const reasons = Array.isArray(ranked.reasons) ? ranked.reasons.join(", ") : "";
    return [
      createStackCard(
        `${index + 1}. ${block.kind || "block"}`,
        block.text || "",
        `score=${Number(ranked.score || 0).toFixed(2)}${reasons ? ` | ${reasons}` : ""}`
      ),
    ];
  });

  setStackContent(blocksListNode, items, "尚未取得 block ranking。");
}

function renderDiagnostics(tab, classification, extraction, processedArticle) {
  latestDiagnostics = {
    tab: {
      title: tab?.title || "",
      url: tab?.url || "",
    },
    classification,
    extraction,
    processedArticle,
  };

  pageTitleNode.textContent = processedArticle?.title || tab?.title || "-";
  pageUrlNode.textContent = tab?.url || "-";
  pageTypeNode.textContent = getPageTypeLabel(classification?.pageType);
  pageConfidenceNode.textContent =
    typeof classification?.confidence === "number" ? classification.confidence.toFixed(2) : "-";
  pageSafeNode.textContent = classification?.safeToSummarize ? "Yes" : "No";
  pageSourceNode.textContent = extraction?.source || processedArticle?.source || "-";
  blockCountNode.textContent = String(extraction?.blocks?.length || processedArticle?.stats?.block_count || 0);
  cleanedCharsNode.textContent = String(processedArticle?.stats?.cleaned_chars || 0);
  promptTokensNode.textContent = String(processedArticle?.stats?.prompt_tokens || 0);
  selectionStrategyNode.textContent = processedArticle?.promptPayload?.selectionStrategy || "-";
  articleHeaderNode.textContent = processedArticle?.promptPayload?.articleHeader || "-";
  compressedContextNode.textContent = processedArticle?.promptPayload?.compressedContext || "-";

  renderWarnings(classification?.warnings);
  renderOutline(extraction?.outline);
  renderRankedBlocks(processedArticle);

  setStatus(
    classification?.safeToSummarize
      ? `分析完成：${getPageTypeLabel(classification?.pageType)}`
      : `分析完成：${getPageTypeLabel(classification?.pageType)}，這頁不像典型文章`,
    classification?.safeToSummarize ? "status-ok" : "status-warn"
  );
}

async function runDiagnostics() {
  runButton.disabled = true;
  copyJsonButton.disabled = true;
  setStatus("分析目前分頁中...");

  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      throw new Error("找不到目前分頁");
    }
    if (isRestrictedUrl(tab.url || "")) {
      throw new Error("瀏覽器內建頁面不允許注入 content script");
    }

    await ensureWasmReady();
    const article = await requestArticle(tab.id);
    const [classification, extraction, processedArticle] = await Promise.all([
      classify_page(article),
      extract_article_blocks(article),
      process_article(article),
    ]);

    renderDiagnostics(tab, classification, extraction, processedArticle);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "分析失敗", "status-warn");
  } finally {
    runButton.disabled = false;
    copyJsonButton.disabled = false;
  }
}

async function copyJson() {
  if (!latestDiagnostics) {
    setStatus("目前沒有可複製的 diagnostics 資料", "status-warn");
    return;
  }

  const serialized = JSON.stringify(latestDiagnostics, null, 2);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(serialized);
    setStatus("已複製 diagnostics JSON", "status-ok");
    return;
  }

  throw new Error("目前瀏覽器不支援 clipboard API");
}

runButton.addEventListener("click", () => {
  runDiagnostics();
});

copyJsonButton.addEventListener("click", async () => {
  try {
    await copyJson();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "複製 JSON 失敗", "status-warn");
  }
});

runDiagnostics();
