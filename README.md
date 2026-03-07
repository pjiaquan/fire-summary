# Fire Summary

這個 repo 現在包含兩份最小可跑的 extension 骨架，並直接使用目前的 Rust/Wasm crate 做摘要。

## 結構

- `extension/manifest.json`: Chrome 用的 Manifest V3 設定
- `extension-firefox/manifest.json`: Firefox 用的保守版 Manifest V2 設定
- `extension/content-script.js`: 從目前頁面擷取標題、文字與備援 HTML
- `extension/popup.*`: 最小 popup UI，呼叫 wasm 摘要函式
- `scripts/build-extension.sh`: 產生 extension 會載入的 wasm glue code

## Build

先安裝 `wasm-pack`，然後在 repo 根目錄執行：

```bash
bash scripts/build-extension.sh
```

這會把輸出放到 `extension/pkg/`。
同時也會同步到 `extension-firefox/pkg/`。

## 載入到 Chrome

1. 開啟 `chrome://extensions`
2. 打開 Developer mode
3. 選 `Load unpacked`
4. 指到這個 repo 的 `extension/`

## 載入到 Firefox

1. 開啟 `about:debugging#/runtime/this-firefox`
2. 選 `Load Temporary Add-on...`
3. 選擇 `extension-firefox/manifest.json`

## Troubleshooting

### Firefox 顯示 `corrupt`

Firefox 對未簽名的本地 extension，常會用很模糊的 `This add-on could not be installed because it appears to be corrupt.` 錯誤訊息。

這個專案在本機開發時，正確做法不是直接安裝 `.zip` / `.xpi`，而是載入 Firefox 專用目錄：

1. 開 `about:debugging#/runtime/this-firefox`
2. 按 `Load Temporary Add-on...`
3. 選 `extension-firefox/manifest.json`

如果你是直接把壓縮檔拖進 Firefox，Release 版通常會因為未簽名而拒絕，訊息看起來就像「corrupt」。

### Chrome 載不進去

Chrome 要用 unpacked 模式載入資料夾，不是載入 repo 根目錄，也不是載入壓縮檔：

1. 開 `chrome://extensions`
2. 打開 Developer mode
3. 選 `Load unpacked`
4. 指到 `extension/`

## 目前行為

popup 會向 content script 要目前頁面的純文字內容，再交給 `summarize_article(...)`。如果目標頁面是瀏覽器內建頁面，例如 `chrome://` 或 `about:`，extension 會直接回報無法擷取。
