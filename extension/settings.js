const api = globalThis.browser ?? globalThis.chrome;
const form = document.getElementById("settings-form");
const saveButton = document.getElementById("save-button");
const saveStatus = document.getElementById("save-status");
const providerInput = document.getElementById("provider");
const modelInput = document.getElementById("model");
const fallbackModelInput = document.getElementById("fallback-model");
const apiKeyInput = document.getElementById("api-key");
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
const clearCacheButton = document.getElementById("clear-cache-button");
const CACHE_INDEX_KEY = "__summaryCacheIndex";
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
  autoExportTxt: false,
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
  return String(text || "").trim().toLocaleLowerCase();
}

function setTargetLanguageDropdownOpen(isOpen) {
  targetLanguageCombobox.classList.toggle("open", isOpen);
  targetLanguageInput.setAttribute("aria-expanded", String(isOpen));
}

function getFilteredLanguages(query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return WORLD_LANGUAGES;
  }

  return WORLD_LANGUAGES.filter((language) =>
    normalizeSearchText(language).includes(normalizedQuery)
  );
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

async function loadSettings() {
  setSaveStatus("讀取設定中...");
  renderTargetLanguageOptions(targetLanguageInput.value);
  customPromptInput.placeholder = DEFAULT_SYSTEM_PROMPT;

  try {
    const settings = await storageGet(DEFAULT_SETTINGS);
    providerInput.value = settings.provider || DEFAULT_SETTINGS.provider;
    modelInput.value = settings.model || DEFAULT_SETTINGS.model;
    fallbackModelInput.value = settings.fallbackModel || DEFAULT_SETTINGS.fallbackModel;
    apiKeyInput.value = settings.apiKey || "";
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
      max: 65536,
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
    apiKey: apiKeyInput.value.trim(),
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
      max: 65536,
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
  };

  try {
    await storageSet(payload);
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
    const stored = await storageGet({ [CACHE_INDEX_KEY]: [] });
    const keys = Array.isArray(stored[CACHE_INDEX_KEY])
      ? stored[CACHE_INDEX_KEY].map((entry) => entry?.key).filter(Boolean)
      : [];
    await storageRemove([...keys, CACHE_INDEX_KEY]);
    setSaveStatus("摘要快取已清空");
  } catch (error) {
    setSaveStatus(error instanceof Error ? error.message : "快取清理失敗");
  } finally {
    clearCacheButton.disabled = false;
  }
});

initializeTargetLanguageCombobox();
loadSettings();
