const api = globalThis.browser ?? globalThis.chrome;
const form = document.getElementById("settings-form");
const saveButton = document.getElementById("save-button");
const saveStatus = document.getElementById("save-status");
const providerInput = document.getElementById("provider");
const modelInput = document.getElementById("model");
const fallbackModelInput = document.getElementById("fallback-model");
const apiKeyInput = document.getElementById("api-key");
const targetLanguageInput = document.getElementById("target-language");
const targetLanguageOptions = document.getElementById("target-language-options");
const customPromptInput = document.getElementById("custom-prompt");
const fontSizeInput = document.getElementById("font-size");
const titleFontInput = document.getElementById("title-font");
const bodyFontInput = document.getElementById("body-font");
const fontWeightInput = document.getElementById("font-weight");
const lineHeightInput = document.getElementById("line-height");
const streamOutputInput = document.getElementById("stream-output");
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
  model: "gemini-2.5-flash",
  fallbackModel: "gemini-2.5-flash",
  apiKey: "",
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

function populateTargetLanguageOptions() {
  targetLanguageOptions.innerHTML = WORLD_LANGUAGES.map(
    (language) => `<option value="${language}"></option>`
  ).join("");
}

function pickStoredValue(value, allowedValues, fallback) {
  return allowedValues.has(value) ? value : fallback;
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
  populateTargetLanguageOptions();
  customPromptInput.placeholder = DEFAULT_SYSTEM_PROMPT;

  try {
    const settings = await storageGet(DEFAULT_SETTINGS);
    providerInput.value = settings.provider || DEFAULT_SETTINGS.provider;
    modelInput.value = settings.model || DEFAULT_SETTINGS.model;
    fallbackModelInput.value = settings.fallbackModel || DEFAULT_SETTINGS.fallbackModel;
    apiKeyInput.value = settings.apiKey || "";
    targetLanguageInput.value = settings.targetLanguage || DEFAULT_SETTINGS.targetLanguage;
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

loadSettings();
