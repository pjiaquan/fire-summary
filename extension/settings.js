const api = globalThis.browser ?? globalThis.chrome;
const form = document.getElementById("settings-form");
const saveButton = document.getElementById("save-button");
const saveStatus = document.getElementById("save-status");
const providerInput = document.getElementById("provider");
const modelInput = document.getElementById("model");
const fallbackModelInput = document.getElementById("fallback-model");
const apiKeyInput = document.getElementById("api-key");
const rememberApiKeyInput = document.getElementById("remember-api-key");
const temperatureInput = document.getElementById("temperature");
const topPInput = document.getElementById("top-p");
const topKInput = document.getElementById("top-k");
const maxOutputTokensInput = document.getElementById("max-output-tokens");
const targetLanguageInput = document.getElementById("target-language");
const targetLanguageCombobox = document.getElementById("target-language-combobox");
const targetLanguageOptions = document.getElementById("target-language-options");
const targetLanguageToggle = document.getElementById("target-language-toggle");
const customPromptInput = document.getElementById("custom-prompt");
const fontSizeInput = document.getElementById("font-size");
const titleFontInput = document.getElementById("title-font");
const bodyFontInput = document.getElementById("body-font");
const fontWeightInput = document.getElementById("font-weight");
const lineHeightInput = document.getElementById("line-height");
const streamOutputInput = document.getElementById("stream-output");
const enableGoogleSearchInput = document.getElementById("enable-google-search");
const autoExportTxtInput = document.getElementById("auto-export-txt");
const summaryCacheEnabledInput = document.getElementById("summary-cache-enabled");
const clearCacheButton = document.getElementById("clear-cache-button");
const openDiagnosticsButton = document.getElementById("open-diagnostics-button");
const CACHE_INDEX_KEY = "__summaryCacheIndex";
const SESSION_API_KEY_KEY = "__sessionApiKey";
const FONT_FAMILY_OPTIONS = new Set(["pingfang", "systemSans", "notoSansTc", "serif"]);
const FONT_WEIGHT_OPTIONS = new Set(["400", "500", "600", "700"]);
const LINE_HEIGHT_OPTIONS = new Set(["1.4", "1.5", "1.6", "1.7", "1.8"]);
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
const WORLD_LANGUAGES = [
  "Afrikaans",
  "Akan",
  "Shqip",
  "አማርኛ",
  "العربية",
  "Armenian",
  "অসমীয়া",
  "Aymara",
  "Azərbaycan dili",
  "Bambara",
  "বাংলা",
  "Euskara",
  "Беларуская",
  "Bosanski",
  "Български",
  "Català",
  "Cebuano",
  "Chichewa",
  "简体中文",
  "繁體中文",
  "Corsu",
  "Hrvatski",
  "Čeština",
  "Dansk",
  "Nederlands",
  "English",
  "Esperanto",
  "Eesti",
  "Ewe",
  "Filipino",
  "Suomi",
  "Français",
  "Frysk",
  "Gaeilge",
  "Galego",
  "ქართული",
  "Deutsch",
  "Ελληνικά",
  "Guaraní",
  "ગુજરાતી",
  "Kreyòl ayisyen",
  "Hausa",
  "ʻŌlelo Hawaiʻi",
  "עברית",
  "हिन्दी",
  "Hmong",
  "Magyar",
  "Íslenska",
  "Igbo",
  "Bahasa Indonesia",
  "Gaeilge na hAlban",
  "Italiano",
  "日本語",
  "Jawa",
  "ಕನ್ನಡ",
  "Қазақ тілі",
  "ខ្មែរ",
  "한국어",
  "Krio",
  "Kurdî",
  "Кыргызча",
  "ລາວ",
  "Latina",
  "Latviešu",
  "Lingála",
  "Lietuvių",
  "Luganda",
  "Lëtzebuergesch",
  "Македонски",
  "Malagasy",
  "Bahasa Melayu",
  "മലയാളം",
  "Malti",
  "Te Reo Māori",
  "मराठी",
  "Монгол",
  "မြန်မာ",
  "नेपाली",
  "Norsk",
  "ଓଡ଼ିଆ",
  "Oromo",
  "پښتو",
  "فارسی",
  "Polski",
  "Português",
  "ਪੰਜਾਬੀ",
  "Quechua",
  "Română",
  "Русский",
  "Samoan",
  "Gàidhlig",
  "Српски",
  "Sesotho",
  "Shona",
  "سنڌي",
  "සිංහල",
  "Slovenčina",
  "Slovenščina",
  "Soomaali",
  "Español",
  "Basa Sunda",
  "Kiswahili",
  "Svenska",
  "Тоҷикӣ",
  "தமிழ்",
  "Татар",
  "తెలుగు",
  "ไทย",
  "ትግርኛ",
  "Türkçe",
  "Türkmen dili",
  "Українська",
  "اردو",
  "ئۇيغۇرچە",
  "Oʻzbekcha",
  "Tiếng Việt",
  "Cymraeg",
  "isiXhosa",
  "יידיש",
  "Yorùbá",
  "isiZulu",
];
const LANGUAGE_SEARCH_ALIASES = {
  "简体中文": ["zh", "zhcn", "zhhans", "cn", "chinese", "mandarin", "simplifiedchinese", "简中", "简体", "中文"],
  "繁體中文": [
    "zh",
    "zhtw",
    "zhhant",
    "tw",
    "traditionalchinese",
    "traditional",
    "繁中",
    "繁體",
    "中文",
  ],
  English: ["en", "eng", "english"],
  日本語: ["ja", "jp", "japanese", "nihongo"],
  "한국어": ["ko", "kr", "korean", "hangul"],
  Français: ["fr", "french", "francais"],
  Deutsch: ["de", "german", "deutsch"],
  Español: ["es", "spanish", "espanol"],
  Italiano: ["it", "italian"],
  Português: ["pt", "portuguese", "portugues", "ptbr", "ptpt"],
  Русский: ["ru", "russian"],
  العربية: ["ar", "arabic"],
  हिन्दी: ["hi", "hindi"],
  "Bahasa Indonesia": ["id", "indonesian", "bahasa"],
  "Bahasa Melayu": ["ms", "malay"],
  Türkçe: ["tr", "turkish"],
  "Tiếng Việt": ["vi", "vietnamese"],
  ไทย: ["th", "thai"],
  Polski: ["pl", "polish"],
  Nederlands: ["nl", "dutch"],
  Svenska: ["sv", "swedish"],
  Dansk: ["da", "danish"],
  Norsk: ["no", "norwegian"],
  Suomi: ["fi", "finnish"],
  Čeština: ["cs", "czech"],
  Ελληνικά: ["el", "greek"],
  Română: ["ro", "romanian"],
  Українська: ["uk", "ukrainian"],
  עברית: ["he", "hebrew"],
};

function setSaveStatus(message) {
  saveStatus.textContent = message;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeSearchText(text) {
  return String(text || "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\s\-_()]+/g, "");
}

function setTargetLanguageDropdownOpen(isOpen) {
  targetLanguageCombobox.classList.toggle("open", isOpen);
  targetLanguageInput.setAttribute("aria-expanded", String(isOpen));
}

function getLanguageSearchTerms(language) {
  const terms = [language, ...(LANGUAGE_SEARCH_ALIASES[language] || [])];
  return terms.map((term) => normalizeSearchText(term)).filter(Boolean);
}

function getFilteredLanguages(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return WORLD_LANGUAGES;
  }

  const matches = [];
  for (const language of WORLD_LANGUAGES) {
    const searchTerms = getLanguageSearchTerms(language);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let termIndex = 0; termIndex < searchTerms.length; termIndex += 1) {
      const normalizedTerm = searchTerms[termIndex];
      if (!normalizedTerm) {
        continue;
      }

      if (normalizedTerm === normalizedQuery) {
        bestScore = Math.min(bestScore, termIndex === 0 ? 0 : 1);
        continue;
      }

      if (normalizedTerm.startsWith(normalizedQuery)) {
        bestScore = Math.min(bestScore, (termIndex === 0 ? 10 : 20) + normalizedTerm.length);
        continue;
      }

      const substringIndex = normalizedTerm.indexOf(normalizedQuery);
      if (substringIndex !== -1) {
        bestScore = Math.min(bestScore, (termIndex === 0 ? 100 : 140) + substringIndex);
        continue;
      }

      let queryIndex = 0;
      let gapPenalty = 0;
      let lastMatchedIndex = -1;
      let startIndex = -1;

      for (let languageIndex = 0; languageIndex < normalizedTerm.length; languageIndex += 1) {
        if (normalizedTerm[languageIndex] !== normalizedQuery[queryIndex]) {
          continue;
        }

        if (startIndex === -1) {
          startIndex = languageIndex;
        }
        if (lastMatchedIndex !== -1) {
          gapPenalty += languageIndex - lastMatchedIndex - 1;
        }
        lastMatchedIndex = languageIndex;
        queryIndex += 1;
        if (queryIndex === normalizedQuery.length) {
          break;
        }
      }

      if (queryIndex === normalizedQuery.length) {
        bestScore = Math.min(bestScore, (termIndex === 0 ? 1000 : 1100) + startIndex + gapPenalty);
      }
    }

    if (Number.isFinite(bestScore)) {
      matches.push({
        language,
        score: bestScore,
      });
    }
  }

  return matches
    .sort((left, right) => left.score - right.score || left.language.localeCompare(right.language))
    .map((match) => match.language);
}

function renderTargetLanguageOptions(query = "") {
  const filteredLanguages = getFilteredLanguages(query);
  if (filteredLanguages.length === 0) {
    const emptyNode = document.createElement("div");
    emptyNode.className = "combo-empty";
    emptyNode.textContent = "找不到符合的語言";
    targetLanguageOptions.replaceChildren(emptyNode);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const language of filteredLanguages) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "combo-option";
    option.dataset.language = language;
    option.textContent = language;
    if (language === targetLanguageInput.value) {
      option.classList.add("selected");
    }
    fragment.append(option);
  }

  targetLanguageOptions.replaceChildren(fragment);
}

function initializeTargetLanguageCombobox() {
  renderTargetLanguageOptions(targetLanguageInput.value);

  targetLanguageInput.addEventListener("focus", () => {
    renderTargetLanguageOptions(targetLanguageInput.value);
    setTargetLanguageDropdownOpen(true);
  });

  targetLanguageInput.addEventListener("input", () => {
    renderTargetLanguageOptions(targetLanguageInput.value);
    setTargetLanguageDropdownOpen(true);
  });

  targetLanguageInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setTargetLanguageDropdownOpen(false);
      return;
    }

    if (event.key === "Enter") {
      const firstOption = targetLanguageOptions.querySelector(".combo-option");
      if (!firstOption) {
        return;
      }

      event.preventDefault();
      targetLanguageInput.value = firstOption.dataset.language || targetLanguageInput.value;
      renderTargetLanguageOptions(targetLanguageInput.value);
      setTargetLanguageDropdownOpen(false);
    }
  });

  targetLanguageToggle.addEventListener("click", () => {
    const nextOpenState = !targetLanguageCombobox.classList.contains("open");
    renderTargetLanguageOptions(targetLanguageInput.value);
    setTargetLanguageDropdownOpen(nextOpenState);
    if (nextOpenState) {
      targetLanguageInput.focus();
    }
  });

  targetLanguageOptions.addEventListener("click", (event) => {
    const option = event.target.closest(".combo-option");
    if (!(option instanceof HTMLElement)) {
      return;
    }

    targetLanguageInput.value = option.dataset.language || "";
    renderTargetLanguageOptions(targetLanguageInput.value);
    setTargetLanguageDropdownOpen(false);
    targetLanguageInput.focus();
  });

  document.addEventListener("pointerdown", (event) => {
    if (targetLanguageCombobox.contains(event.target)) {
      return;
    }

    setTargetLanguageDropdownOpen(false);
  });
}

function pickStoredValue(value, allowedValues, fallback) {
  return allowedValues.has(value) ? value : fallback;
}

function normalizeNumericSetting(value, options) {
  const { min, max, fallback = "", integer = false } = options;
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = integer ? Number.parseInt(trimmed, 10) : Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const clamped = Math.min(max, Math.max(min, parsed));
  if (integer) {
    return String(Math.trunc(clamped));
  }

  return String(Number(clamped.toFixed(4)));
}

function storageGet(defaults) {
  const maybePromise = api.storage.local.get(defaults);
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
  const maybePromise = api.storage.local.set(value);
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

function storageRemove(keys) {
  const maybePromise = api.storage.local.remove(keys);
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

function sessionStorageSet(value) {
  if (!sessionStorageAvailable()) {
    return Promise.resolve();
  }

  const maybePromise = api.storage.session.set(value);
  if (maybePromise && typeof maybePromise.then === "function") {
    return maybePromise;
  }

  return new Promise((resolve, reject) => {
    api.storage.session.set(value, () => {
      const lastError = api.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve();
    });
  });
}

function sessionStorageRemove(keys) {
  if (!sessionStorageAvailable()) {
    return Promise.resolve();
  }

  const maybePromise = api.storage.session.remove(keys);
  if (maybePromise && typeof maybePromise.then === "function") {
    return maybePromise;
  }

  return new Promise((resolve, reject) => {
    api.storage.session.remove(keys, () => {
      const lastError = api.runtime?.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve();
    });
  });
}

async function clearSummaryCache() {
  const stored = await storageGet({ [CACHE_INDEX_KEY]: [] });
  const keys = Array.isArray(stored[CACHE_INDEX_KEY])
    ? stored[CACHE_INDEX_KEY].map((entry) => entry?.key).filter(Boolean)
    : [];
  await storageRemove([...keys, CACHE_INDEX_KEY]);
}

async function loadSettings() {
  setSaveStatus("讀取設定中...");
  renderTargetLanguageOptions(targetLanguageInput.value);
  customPromptInput.placeholder = DEFAULT_SYSTEM_PROMPT;

  try {
    const settings = await storageGet(DEFAULT_SETTINGS);
    const sessionApiKey = await sessionStorageGet({ [SESSION_API_KEY_KEY]: "" });
    providerInput.value = settings.provider || DEFAULT_SETTINGS.provider;
    modelInput.value = settings.model || DEFAULT_SETTINGS.model;
    fallbackModelInput.value = settings.fallbackModel || DEFAULT_SETTINGS.fallbackModel;
    rememberApiKeyInput.checked = Boolean(settings.rememberApiKey);
    apiKeyInput.value =
      settings.apiKey ||
      sessionApiKey[SESSION_API_KEY_KEY] ||
      "";
    temperatureInput.value = normalizeNumericSetting(settings.temperature, {
      min: 0,
      max: 2,
      fallback: DEFAULT_SETTINGS.temperature,
    });
    topPInput.value = normalizeNumericSetting(settings.topP, {
      min: 0,
      max: 1,
      fallback: DEFAULT_SETTINGS.topP,
    });
    topKInput.value = normalizeNumericSetting(settings.topK, {
      min: 1,
      max: 200,
      fallback: DEFAULT_SETTINGS.topK,
      integer: true,
    });
    maxOutputTokensInput.value = normalizeNumericSetting(settings.maxOutputTokens, {
      min: 1,
      max: 8192,
      fallback: DEFAULT_SETTINGS.maxOutputTokens,
      integer: true,
    });
    targetLanguageInput.value = settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
    renderTargetLanguageOptions(targetLanguageInput.value);
    customPromptInput.value = settings.customPrompt || "";
    fontSizeInput.value = settings.fontSize || DEFAULT_SETTINGS.fontSize;
    titleFontInput.value = pickStoredValue(
      settings.titleFont,
      FONT_FAMILY_OPTIONS,
      DEFAULT_SETTINGS.titleFont
    );
    bodyFontInput.value = pickStoredValue(
      settings.bodyFont,
      FONT_FAMILY_OPTIONS,
      DEFAULT_SETTINGS.bodyFont
    );
    fontWeightInput.value = pickStoredValue(
      String(settings.fontWeight || ""),
      FONT_WEIGHT_OPTIONS,
      DEFAULT_SETTINGS.fontWeight
    );
    lineHeightInput.value = pickStoredValue(
      String(settings.lineHeight || ""),
      LINE_HEIGHT_OPTIONS,
      DEFAULT_SETTINGS.lineHeight
    );
    streamOutputInput.checked = Boolean(settings.streamOutput);
    enableGoogleSearchInput.checked = Boolean(settings.enableGoogleSearch);
    autoExportTxtInput.checked = Boolean(settings.autoExportTxt);
    summaryCacheEnabledInput.checked = Boolean(settings.summaryCacheEnabled);
    if (!sessionStorageAvailable() && !rememberApiKeyInput.checked) {
      setSaveStatus("設定已載入。此瀏覽器不支援 session storage，API Key 仍會保存在 extension storage。");
      return;
    }
    setSaveStatus("設定已載入");
  } catch (error) {
    setSaveStatus(error instanceof Error ? error.message : "設定讀取失敗");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  setSaveStatus("儲存中...");

  const payload = {
    provider: providerInput.value || DEFAULT_SETTINGS.provider,
    model: modelInput.value || DEFAULT_SETTINGS.model,
    fallbackModel: fallbackModelInput.value || DEFAULT_SETTINGS.fallbackModel,
    apiKey: "",
    rememberApiKey: rememberApiKeyInput.checked,
    temperature: normalizeNumericSetting(temperatureInput.value, {
      min: 0,
      max: 2,
      fallback: DEFAULT_SETTINGS.temperature,
    }),
    topP: normalizeNumericSetting(topPInput.value, {
      min: 0,
      max: 1,
      fallback: DEFAULT_SETTINGS.topP,
    }),
    topK: normalizeNumericSetting(topKInput.value, {
      min: 1,
      max: 200,
      fallback: DEFAULT_SETTINGS.topK,
      integer: true,
    }),
    maxOutputTokens: normalizeNumericSetting(maxOutputTokensInput.value, {
      min: 1,
      max: 8192,
      fallback: DEFAULT_SETTINGS.maxOutputTokens,
      integer: true,
    }),
    targetLanguage: targetLanguageInput.value.trim() || DEFAULT_SETTINGS.targetLanguage,
    customPrompt: customPromptInput.value.trim(),
    fontSize: fontSizeInput.value || DEFAULT_SETTINGS.fontSize,
    titleFont: pickStoredValue(titleFontInput.value, FONT_FAMILY_OPTIONS, DEFAULT_SETTINGS.titleFont),
    bodyFont: pickStoredValue(bodyFontInput.value, FONT_FAMILY_OPTIONS, DEFAULT_SETTINGS.bodyFont),
    fontWeight: pickStoredValue(
      fontWeightInput.value,
      FONT_WEIGHT_OPTIONS,
      DEFAULT_SETTINGS.fontWeight
    ),
    lineHeight: pickStoredValue(
      lineHeightInput.value,
      LINE_HEIGHT_OPTIONS,
      DEFAULT_SETTINGS.lineHeight
    ),
    streamOutput: streamOutputInput.checked,
    enableGoogleSearch: enableGoogleSearchInput.checked,
    autoExportTxt: autoExportTxtInput.checked,
    summaryCacheEnabled: summaryCacheEnabledInput.checked,
  };
  const nextApiKey = apiKeyInput.value.trim();

  try {
    if (payload.rememberApiKey || !sessionStorageAvailable()) {
      payload.apiKey = nextApiKey;
      await storageSet(payload);
      await sessionStorageRemove(SESSION_API_KEY_KEY);
    } else {
      await storageSet(payload);
      await storageRemove("apiKey");
      if (nextApiKey) {
        await sessionStorageSet({ [SESSION_API_KEY_KEY]: nextApiKey });
      } else {
        await sessionStorageRemove(SESSION_API_KEY_KEY);
      }
    }
    if (!payload.summaryCacheEnabled) {
      await clearSummaryCache();
    }
    if (!sessionStorageAvailable() && !payload.rememberApiKey) {
      setSaveStatus("設定已儲存。此瀏覽器不支援 session storage，API Key 仍會保存在 extension storage。");
      return;
    }
    setSaveStatus("設定已儲存");
  } catch (error) {
    setSaveStatus(error instanceof Error ? error.message : "儲存失敗");
  } finally {
    saveButton.disabled = false;
  }
});

clearCacheButton.addEventListener("click", async () => {
  clearCacheButton.disabled = true;
  setSaveStatus("清理快取中...");

  try {
    await clearSummaryCache();
    setSaveStatus("摘要快取已清空");
  } catch (error) {
    setSaveStatus(error instanceof Error ? error.message : "快取清理失敗");
  } finally {
    clearCacheButton.disabled = false;
  }
});

openDiagnosticsButton?.addEventListener("click", async () => {
  try {
    if (api.tabs?.create && api.runtime?.getURL) {
      await api.tabs.create({ url: api.runtime.getURL("diagnostics.html") });
      setSaveStatus("已開啟 Rust Diagnostics");
      return;
    }

    throw new Error("目前瀏覽器無法開啟 diagnostics 頁面");
  } catch (error) {
    setSaveStatus(error instanceof Error ? error.message : "無法開啟 diagnostics");
  }
});

initializeTargetLanguageCombobox();
loadSettings();
