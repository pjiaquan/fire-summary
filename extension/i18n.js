const I18N_TRANSLATIONS = {
  en: {
    // Settings page
    "settings.title": "Fire Summary",
    "settings.eyebrow": "Settings",
    "settings.lead": "Manage Gemini API, target language, prompt, and shortcut preferences.",
    "settings.apiProvider": "API Provider",
    "settings.model": "Model",
    "settings.fallbackModel": "Fallback Model",
    "settings.fallbackModelHint": "Automatically use this model when the primary model fails or is unavailable.",
    "settings.geminiApiKey": "Gemini API Key",
    "settings.apiKeyLink": "Get API Key from Google AI Studio",
    "settings.apiKeyHint": "By default, only kept in the current browser session. Only check \"Remember API Key\" to persist long-term.",
    "settings.rememberApiKey": "Remember API Key",
    "settings.rememberApiKeyHint": "When disabled, session storage is preferred; falls back to extension storage only if the browser doesn't support it.",
    "settings.apiParameters": "API Parameters",
    "settings.apiParametersHint": "Controls Gemini generation parameters. Search feature only works on supported models and may increase data transfer.",
    "settings.apiParametersHint2": "If you're unsure, keep defaults. Usually you only need to adjust Temperature.",
    "settings.temperature": "Temperature",
    "settings.temperatureHint": "Controls response stability and creativity. Lower is more stable, higher is more diverse. For summaries, lower values like 0.2 to 0.5 are recommended.",
    "settings.topP": "Top P",
    "settings.topPHint": "Controls how many candidate tokens the model considers. Usually leave empty to use model default; only adjust when you want more conservative or diverse output.",
    "settings.topK": "Top K",
    "settings.topKHint": "Limits how many candidate tokens are considered at each step. Most users don't need to change this; leaving empty lets the model use its default for stability.",
    "settings.maxOutputTokens": "Max Output Tokens",
    "settings.maxOutputTokensHint": "Controls maximum response length. Setting too high increases costs and may make responses verbose; for summaries, 1024 to 2048 is usually sufficient.",
    "settings.placeholderModel": "e.g., gemini-3.1-flash-lite-preview",
    "settings.placeholder留空代表使用模型預設": "Leave empty to use model default",
    "settings.max8192": "Maximum 8192",
    "settings.targetLanguage": "Target Language",
    "settings.targetLanguageHint": "Search by keyword or select from the dropdown list.",
    "settings.placeholder搜尋或選擇目標語言": "Search or select target language",
    "settings.customPrompt": "Custom Prompt",
    "settings.customPromptPlaceholder": "Enter prompts to attach during summarization, e.g., organize key points and action items from a product manager perspective.",
    "settings.shortcut": "Shortcut",
    "settings.shortcutHint": "Default shortcut for Chrome and Firefox Desktop is Alt+X; triggering opens Fire Summary popup and starts summarization automatically.",
    "settings.shortcutHint2": "Firefox Desktop also registers the same shortcut; Android Firefox doesn't support extension commands yet, and will switch to full-page summary interface when opened.",
    "settings.shortcutHint3": "If the shortcut doesn't work, check the browser's extension shortcuts settings page to confirm the actual binding.",
    "settings.fontSize": "Font Size",
    "settings.fontSizeSmall": "Small",
    "settings.fontSizeMedium": "Medium",
    "settings.fontSizeLarge": "Large",
    "settings.typography": "Typography",
    "settings.typographyHint": "Controls title font, body font, weight, and line height for popup summary and discussion pages.",
    "settings.titleFont": "Title Font",
    "settings.bodyFont": "Body Font",
    "settings.fontWeight": "Font Weight",
    "settings.lineHeight": "Line Height",
    "settings.fontPingFang": "PingFang (Apple)",
    "settings.fontSystemSans": "System Sans-serif",
    "settings.fontNotoSansTc": "Noto Sans TC",
    "settings.fontSerif": "Serif",
    "settings.streamOutput": "Stream Output",
    "settings.streamOutputHint": "When enabled, uses Gemini streaming API to fill in summary content in real-time.",
    "settings.googleSearchGrounding": "Google Search Grounding",
    "settings.googleSearchGroundingHint": "Allows Gemini to use Google Search tool when needed. Some models may not support this and it increases external data query risk.",
    "settings.autoExportTxt": "Auto Export TXT",
    "settings.autoExportTxtHint": "Automatically download .txt after summary completes, using AI-generated title as filename.",
    "settings.summaryCache": "Summary Cache",
    "settings.summaryCacheHint": "When disabled, summary cache is not preserved. When enabled, only summary results are cached and automatically cleared after 1 day.",
    "settings.cacheProtection": "Cache Protection",
    "settings.cacheProtectionHint": "Only caches AI summary results, not full article text. Cache limit is 20 entries and auto-clears after 1 day.",
    "settings.clearCache": "Clear Summary Cache",
    "settings.uiLanguage": "UI Language",
    "settings.uiLanguageHint": "Language used for extension interface. Does not affect AI response language.",
    "settings.notSaved": "Not saved",
    "settings.save": "Save Settings",
    "settings.saving": "Saving...",
    "settings.loaded": "Settings loaded",
    "settings.saved": "Settings saved",
    "settings.failed": "Failed to save",
    "settings.reading": "Reading settings...",
    "settings.clearing": "Clearing cache...",
    "settings.cacheCleared": "Summary cache cleared",
    "settings.cacheClearFailed": "Cache clear failed",
    "settings.browserNoSessionStorage": "Settings loaded. This browser doesn't support session storage, API Key will still be saved in extension storage.",
    "settings.savedNoSessionStorage": "Settings saved. This browser doesn't support session storage, API Key will still be saved in extension storage.",
    "settings.noMatchLanguage": "No matching languages found",

    // Popup page
    "popup.copySummary": "Copy Summary",
    "popup.copyArticle": "Copy Article",
    "popup.waiting": "Waiting for action",
    "popup.noSummaryYet": "No summary generated yet.",
    "popup.settings": "Settings",
    "popup.discussion": "Discussion",

    // Discussion page
    "discussion.title": "Fire Summary Discussion",
    "discussion.noSummaryLoaded": "No summary loaded",
    "discussion.summaryNotFound": "Summary content not found.",
    "discussion.contextTitle": "Context Title",
    "discussion.contextUrl": "Context URL",
    "discussion.extendedDiscussion": "Extended Discussion",
    "discussion.discussionPlaceholder": "e.g., analyze from engineering risks, product value, and next action perspectives.",
    "discussion.continueFromSummary": "You can continue asking follow-up questions based on the current summary.",
    "discussion.exportDiscussion": "Export Discussion",
    "discussion.sendQuestion": "Send Question",
    "discussion.ctrlEnter": "Ctrl + Enter to send",
    "discussion.you": "You",
    "discussion.gemini": "Gemini",
    "discussion.thinking": "Thinking...",
    "discussion.noContent": "No content yet.",
    "discussion.summaryModel": "Summary model",
    "discussion.unnamedSummary": "Unnamed summary",
    "discussion.noSummaryContext": "No summary context available. Generate a summary in the popup first.",
    "discussion.backToPopup": "Go back to popup to run a summary first.",
    "discussion.canContinueFromSummary": "You can continue topics related to the current summary.",
    "discussion.mainModelFailed": "Main model failed, using fallback",
    "discussion.streamingReply": "Gemini streaming reply...",
    "discussion.replying": "Gemini replying...",
    "discussion.usedModel": "Used {model} to reply.",
    "discussion.failed": "Failed",
    "discussion.noQuestion": "Please enter a question to continue.",
    "discussion.noContext": "No summary context yet, please run a summary in the popup first.",
    "discussion.noDiscussionToExport": "No extended discussion to export yet.",
    "discussion.copiedToClipboard": "Extended discussion copied to clipboard.",
    "discussion.exported": "Current extended discussion exported.",
    "discussion.exportFailed": "Export failed.",
    "discussion.initializationFailed": "Discussion page initialization failed",

    // Status messages (popup.js)
    "status.extractingContent": "Extracting page content...",
    "status.preparingSummary": "Preparing summary...",
    "status.callingGemini": "Calling Gemini API...",
    "status.summaryStreaming": "Summary streaming...",
    "status.cachedModel": "Cached: {model}",
    "status.cacheHit": "Cache hit",
    "status.failed": "Summary failed",
    "status.noSummaryToCopy": "No summary to copy",
    "status.copyFailed": "Copy failed",
    "status.copiedMarkdownChars": "Copied Markdown summary, {count} chars",
    "status.extractingFullArticle": "Extracting full article...",
    "status.noArticleToCopy": "No article to copy",
    "status.copiedFullArticleChars": "Copied full article, {count} chars",
    "status.cannotOpenSettings": "Cannot open settings page",
    "status.cannotOpenDiscussion": "Cannot open discussion page",
    "status.cannotOpenPage": "Cannot open page",
    "status.tabNotFound": "Tab not found",
    "status.cannotInjectContentScript": "Cannot inject content script into built-in browser pages",
    "status.unsupportedProvider": "Unsupported provider: {provider}",
    "status.noApiKey": "Please enter Gemini API Key in settings page first",
    "status.geminiNoSummary": "Gemini API did not return usable summary",
    "status.streamFormatError": "Gemini stream response format is not event-stream",
    "status.streamNotReadable": "Gemini streaming response is not readable",
    "status.streamNoContent": "Gemini stream did not return usable summary",
    "status.pageType": "Page type: {label}",
    "status.pageTypeMayNotBeTypical": "Page type: {label}, may not be a typical article",
    "status.sourceModelChars": "{source}: {model}, {chars} chars",
    "status.fallbackSource": "fallback",
    "status.mainSource": "source",

    // Page type labels
    "pageType.article": "Article",
    "pageType.selection": "Selection",
    "pageType.docsPage": "Documentation",
    "pageType.searchResults": "Search Results",
    "pageType.listingPage": "Listing",
    "pageType.productPage": "Product",
    "pageType.discussionThread": "Discussion",
    "pageType.paywalledPage": "Paywall",
    "pageType.sparsePage": "Sparse Content",
    "pageType.genericPage": "General",
    "pageType.unknown": "Unknown",

    // Discussion export
    "export.summary": "Summary",
    "export.highSignalContent": "High Signal Content",
    "export.extendedDiscussion": "Extended Discussion",
  },
  "zh-TW": {
    // Settings page
    "settings.title": "Fire Summary",
    "settings.eyebrow": "設定",
    "settings.lead": "管理 Gemini API、目標語言、Prompt 與 shortcut 偏好。",
    "settings.apiProvider": "API Provider",
    "settings.model": "Model",
    "settings.fallbackModel": "Fallback Model",
    "settings.fallbackModelHint": "當主模型失效或不存在時，自動改用這個模型。",
    "settings.geminiApiKey": "Gemini API Key",
    "settings.apiKeyLink": "前往 Google AI Studio 取得 API Key",
    "settings.apiKeyHint": "預設只保留在目前瀏覽器 session。只有勾選 Remember API Key 才會長期保存。",
    "settings.rememberApiKey": "Remember API Key",
    "settings.rememberApiKeyHint": "關閉時會優先使用 session storage；若瀏覽器不支援，才退回 extension storage。",
    "settings.apiParameters": "API Parameters",
    "settings.apiParametersHint": "控制 Gemini 生成參數。搜尋功能只會在支援的模型上生效，並可能增加資料外送範圍。",
    "settings.apiParametersHint2": "如果你不確定怎麼選，大多數情況維持預設就好。通常只需要先調 Temperature。",
    "settings.temperature": "Temperature",
    "settings.temperatureHint": "控制回覆的穩定度與創意。越低越穩定、越高越發散；摘要通常建議用低一點，例如 0.2 到 0.5。",
    "settings.topP": "Top P",
    "settings.topPHint": "控制模型從多大範圍的候選詞中挑選。通常留空即可；只有在你想更保守或更發散時才需要調整。",
    "settings.topK": "Top K",
    "settings.topKHint": "限制每一步最多考慮多少個候選詞。一般使用者通常不需要改，留空讓模型用自己的預設最穩。",
    "settings.maxOutputTokens": "Max Output Tokens",
    "settings.maxOutputTokensHint": "控制回覆最長可以有多長。設太高會增加成本，也可能讓回覆變得冗長；摘要通常 1024 到 2048 就夠。",
    "settings.placeholderModel": "例如：gemini-3.1-flash-lite-preview",
    "settings.placeholder留空代表使用模型預設": "留空代表使用模型預設",
    "settings.max8192": "最大 8192",
    "settings.targetLanguage": "Target Language",
    "settings.targetLanguageHint": "輸入關鍵字可搜尋，也可以直接從下拉清單選擇。",
    "settings.placeholder搜尋或選擇目標語言": "搜尋或選擇目標語言",
    "settings.customPrompt": "Custom Prompt",
    "settings.customPromptPlaceholder": "輸入你希望摘要時附加的提示，例如：請用產品經理視角整理重點與行動項目。",
    "settings.shortcut": "Shortcut",
    "settings.shortcutHint": "Chrome 與 Firefox Desktop 預設快捷鍵是 Alt+X；觸發後會直接開啟 Fire Summary popup 並自動開始摘要。",
    "settings.shortcutHint2": "Firefox Desktop 也會註冊同一組快捷鍵；Android Firefox 仍不支援 extension commands，會在開啟後自動切到全頁摘要介面。",
    "settings.shortcutHint3": "如果快捷鍵沒有生效，請先到瀏覽器的 extension shortcuts 設定頁確認目前實際綁定值。",
    "settings.fontSize": "Font Size",
    "settings.fontSizeSmall": "Small",
    "settings.fontSizeMedium": "Medium",
    "settings.fontSizeLarge": "Large",
    "settings.typography": "Typography",
    "settings.typographyHint": "控制 popup 摘要與延伸討論頁的標題字體、內文字體、字重與行高。",
    "settings.titleFont": "標題字體",
    "settings.bodyFont": "內文字體",
    "settings.fontWeight": "Font Weight",
    "settings.lineHeight": "Line Height",
    "settings.fontPingFang": "蘋方（PingFang）",
    "settings.fontSystemSans": "系統預設無襯線體（System Sans-serif）",
    "settings.fontNotoSansTc": "思源黑體（Noto Sans TC）",
    "settings.fontSerif": "經典襯線體（Serif）",
    "settings.streamOutput": "Stream Output",
    "settings.streamOutputHint": "勾選後會改用 Gemini streaming API，即時回填摘要內容。",
    "settings.googleSearchGrounding": "Google Search Grounding",
    "settings.googleSearchGroundingHint": "讓 Gemini 視需要使用 Google Search 工具。部分模型可能不支援，且會增加外部資料查詢風險。",
    "settings.autoExportTxt": "Auto Export TXT",
    "settings.autoExportTxtHint": "摘要完成後自動下載 .txt，檔名會用 AI 產生的標題。",
    "settings.summaryCache": "Summary Cache",
    "settings.summaryCacheHint": "關閉後不保存摘要快取。開啟時只保存摘要結果，並會在 1 天後自動清理。",
    "settings.cacheProtection": "Cache Protection",
    "settings.cacheProtectionHint": "只快取 AI 摘要結果，不保存全文。快取上限仍為 20 筆，並會在 1 天後自動清理。",
    "settings.clearCache": "清空摘要快取",
    "settings.uiLanguage": "UI Language",
    "settings.uiLanguageHint": "Extension 介面語言。不會影響 AI 回覆語言。",
    "settings.notSaved": "尚未儲存",
    "settings.save": "儲存設定",
    "settings.saving": "儲存中...",
    "settings.loaded": "設定已載入",
    "settings.saved": "設定已儲存",
    "settings.failed": "儲存失敗",
    "settings.reading": "讀取設定中...",
    "settings.clearing": "清理快取中...",
    "settings.cacheCleared": "摘要快取已清空",
    "settings.cacheClearFailed": "快取清理失敗",
    "settings.browserNoSessionStorage": "設定已載入。此瀏覽器不支援 session storage，API Key 仍會保存在 extension storage。",
    "settings.savedNoSessionStorage": "設定已儲存。此瀏覽器不支援 session storage，API Key 仍會保存在 extension storage。",
    "settings.noMatchLanguage": "找不到符合的語言",

    // Popup page
    "popup.copySummary": "複製摘要",
    "popup.copyArticle": "複製全文",
    "popup.waiting": "等待操作",
    "popup.noSummaryYet": "尚未產生摘要。",
    "popup.settings": "設定",
    "popup.discussion": "延伸討論",

    // Discussion page
    "discussion.title": "Fire Summary 延伸討論",
    "discussion.noSummaryLoaded": "尚未載入摘要",
    "discussion.summaryNotFound": "摘要內容不存在。",
    "discussion.contextTitle": "Context Title",
    "discussion.contextUrl": "Context URL",
    "discussion.extendedDiscussion": "延伸討論",
    "discussion.discussionPlaceholder": "例如：請從工程風險、產品價值、下一步行動三個角度延伸分析。",
    "discussion.continueFromSummary": "可根據目前摘要繼續追問。",
    "discussion.exportDiscussion": "匯出討論",
    "discussion.sendQuestion": "送出問題",
    "discussion.ctrlEnter": "Ctrl + Enter 送出",
    "discussion.you": "You",
    "discussion.gemini": "Gemini",
    "discussion.thinking": "思考中...",
    "discussion.noContent": "目前沒有內容。",
    "discussion.summaryModel": "摘要模型",
    "discussion.unnamedSummary": "未命名摘要",
    "discussion.noSummaryContext": "目前沒有摘要上下文。請先在 popup 產生一次摘要。",
    "discussion.backToPopup": "回到 popup 執行摘要後，再開啟這個頁面。",
    "discussion.canContinueFromSummary": "你可以根據目前摘要繼續延伸相關話題。",
    "discussion.mainModelFailed": "主模型失敗，改用 fallback",
    "discussion.streamingReply": "Gemini 串流回覆中...",
    "discussion.replying": "Gemini 回覆中...",
    "discussion.usedModel": "已使用 {model} 回覆。",
    "discussion.failed": "延伸討論失敗",
    "discussion.noQuestion": "請先輸入想延伸的問題。",
    "discussion.noContext": "還沒有摘要上下文，請先回 popup 跑一次摘要。",
    "discussion.noDiscussionToExport": "目前還沒有可匯出的延伸討論。",
    "discussion.copiedToClipboard": "已複製延伸討論到剪貼簿。",
    "discussion.exported": "已匯出目前延伸討論。",
    "discussion.exportFailed": "匯出失敗。",
    "discussion.initializationFailed": "討論頁初始化失敗",

    // Status messages (popup.js)
    "status.extractingContent": "擷取頁面內容中...",
    "status.preparingSummary": "準備摘要中...",
    "status.callingGemini": "呼叫 Gemini API 中...",
    "status.summaryStreaming": "摘要串流中...",
    "status.cachedModel": "已命中快取：{model}",
    "status.cacheHit": "快取命中",
    "status.failed": "摘要失敗",
    "status.noSummaryToCopy": "沒有可複製的摘要",
    "status.copyFailed": "複製摘要失敗",
    "status.copiedMarkdownChars": "已複製 Markdown 摘要，共 {count} 字",
    "status.extractingFullArticle": "擷取全文中...",
    "status.noArticleToCopy": "沒有可複製的全文",
    "status.copiedFullArticleChars": "已複製全文，共 {count} 字",
    "status.cannotOpenSettings": "無法開啟設定頁",
    "status.cannotOpenDiscussion": "無法開啟討論頁",
    "status.cannotOpenPage": "無法開啟頁面",
    "status.tabNotFound": "找不到目前分頁",
    "status.cannotInjectContentScript": "瀏覽器內建頁面不允許注入 content script",
    "status.unsupportedProvider": "目前不支援的 provider: {provider}",
    "status.noApiKey": "請先到設定頁填入 Gemini API Key",
    "status.geminiNoSummary": "Gemini API 沒有回傳可用摘要",
    "status.streamFormatError": "Gemini stream 回應格式不是 event-stream",
    "status.streamNotReadable": "Gemini streaming response 不可讀",
    "status.streamNoContent": "Gemini stream 沒有回傳可用摘要",
    "status.pageType": "頁面判斷：{label}",
    "status.pageTypeMayNotBeTypical": "頁面判斷：{label}，可能不是典型文章",
    "status.sourceModelChars": "{source}：{model}，共 {chars} 字",
    "status.fallbackSource": "fallback",
    "status.mainSource": "來源",

    // Page type labels
    "pageType.article": "文章頁",
    "pageType.selection": "選取內容",
    "pageType.docsPage": "文件頁",
    "pageType.searchResults": "搜尋結果頁",
    "pageType.listingPage": "列表頁",
    "pageType.productPage": "產品頁",
    "pageType.discussionThread": "討論串",
    "pageType.paywalledPage": "訂閱牆頁面",
    "pageType.sparsePage": "內容稀少頁",
    "pageType.genericPage": "一般頁面",
    "pageType.unknown": "未知頁面",

    // Discussion export
    "export.summary": "摘要",
    "export.highSignalContent": "高訊號文章內容",
    "export.extendedDiscussion": "延伸討論",
  },
};

let currentLanguage = "en";

function setUiLanguage(lang) {
  if (I18N_TRANSLATIONS[lang]) {
    currentLanguage = lang;
  }
}

function getUiLanguage() {
  return currentLanguage;
}

function t(key, params = {}) {
  const translations = I18N_TRANSLATIONS[currentLanguage] || I18N_TRANSLATIONS["en"];
  let text = translations[key] || I18N_TRANSLATIONS["en"][key] || key;

  // Replace placeholders like {name}
  for (const [paramKey, paramValue] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue));
  }

  return text;
}

function applyTranslations(container = document) {
  // Handle elements with data-i18n attribute
  const i18nElements = container.querySelectorAll("[data-i18n]");
  for (const element of i18nElements) {
    const key = element.getAttribute("data-i18n");
    if (key) {
      element.textContent = t(key);
    }
  }

  // Handle elements with data-i18n-placeholder attribute
  const placeholderElements = container.querySelectorAll("[data-i18n-placeholder]");
  for (const element of placeholderElements) {
    const key = element.getAttribute("data-i18n-placeholder");
    if (key) {
      element.placeholder = t(key);
    }
  }

  // Handle elements with data-i18n-title attribute
  const titleElements = container.querySelectorAll("[data-i18n-title]");
  for (const element of titleElements) {
    const key = element.getAttribute("data-i18n-title");
    if (key) {
      element.title = t(key);
    }
  }

  // Handle elements with data-i18n-aria-label attribute
  const ariaLabelElements = container.querySelectorAll("[data-i18n-aria-label]");
  for (const element of ariaLabelElements) {
    const key = element.getAttribute("data-i18n-aria-label");
    if (key) {
      element.setAttribute("aria-label", t(key));
    }
  }
}

function translatePage(key) {
  return t(key);
}

export { setUiLanguage, getUiLanguage, t, applyTranslations, translatePage };
