# Fire Summary

![Fire Summary logo](logo.png)

這個 repo 現在包含一份共用的 extension 來源，並直接使用目前的 Rust/Wasm crate 做摘要。
Chrome 與 Firefox 共用同一份來源，Firefox Desktop / Android 版本會在 build/release 時自動產生。

## 結構

- `extension/manifest.json`: Chrome 用的 Manifest V3 設定
- `extension/manifest.firefox.desktop.json`: Firefox Desktop 用的 Manifest V2 模板，保留快捷鍵
- `extension/manifest.firefox.android.json`: Firefox Android 用的 Manifest V2 模板，不含快捷鍵
- `extension/content-script.js`: 從目前頁面擷取標題、文字與備援 HTML
- `extension/popup.*`: 最小 popup UI，呼叫 wasm 摘要函式
- `scripts/build-extension.sh`: 產生 wasm 與可載入的 Chrome/Firefox build 目錄

## Build

先安裝 `wasm-pack`，然後在 repo 根目錄執行：

```bash
bash scripts/build-extension.sh
```

這會把輸出放到 `extension/pkg/`。
同時也會建立：

- `build/chrome-extension/`
- `build/firefox-desktop-extension/`
- `build/firefox-android-extension/`

## Package Release

如果要產出可提交的 release 壓縮檔，在 repo 根目錄執行：

```bash
bash scripts/package-extension.sh
```

這會先重新 build wasm，然後輸出：

- `dist/fire-summary-chrome-v<version>.zip`
- `dist/fire-summary-firefox-desktop-v<version>.zip`
- `dist/fire-summary-firefox-android-v<version>.zip`

如果要另外產出 Firefox reviewer 用的 source code zip，在 repo 根目錄執行：

```bash
bash scripts/firefox-source-package.sh
```

這會輸出：

- `dist/fire-summary-firefox-source-v<version>.zip`

## GitHub Release

Repo 已包含 GitHub Actions release workflow：

- 推送 tag，例如 `v0.1.0`，會自動 build、打包、建立 GitHub Release 並上傳 zip
- 同時也會附上 Firefox reviewer 可用的 source code zip
- 也可從 Actions 頁面手動執行 `Release` workflow，並填入 `release_tag`
- 也可執行 `Cut Release` workflow，自動把版本加一、commit、tag、push，然後觸發正式 release

建議流程：

```bash
git tag v0.1.0
git push origin v0.1.0
```

如果你要在本機手動調整版本，也可以用：

```bash
bash scripts/bump-version.sh patch
```

支援：

- `patch`
- `minor`
- `major`
- 或直接指定版本，例如 `1.2.3`

## Privacy

上架商店可直接引用 repo 內的隱私政策文件：

- `PRIVACY.md`
- `STORE_LISTING.md`

上架截圖可由下列腳本重建，預設會輸出到 `output/playwright/store/screenshots/`：

```bash
PLAYWRIGHT_MODULE_PATH=/tmp/fire-summary-playwright/node_modules/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/tmp/fire-summary-playwright-browsers \
node scripts/render-store-screenshots.mjs
```

## 載入到 Chrome

1. 開啟 `chrome://extensions`
2. 打開 Developer mode
3. 選 `Load unpacked`
4. 指到這個 repo 的 `build/chrome-extension/`

## 載入到 Firefox Desktop

1. 開啟 `about:debugging#/runtime/this-firefox`
2. 選 `Load Temporary Add-on...`
3. 選擇 `build/firefox-desktop-extension/manifest.json`

## 載入到 Firefox Android

1. 開啟 `about:debugging#/runtime/this-firefox`
2. 選 `Load Temporary Add-on...`
3. 選擇 `build/firefox-android-extension/manifest.json`

## Troubleshooting

### Firefox 顯示 `corrupt`

Firefox 對未簽名的本地 extension，常會用很模糊的 `This add-on could not be installed because it appears to be corrupt.` 錯誤訊息。

這個專案在本機開發時，正確做法不是直接安裝 `.zip` / `.xpi`，而是載入 Firefox 專用目錄：

1. 開 `about:debugging#/runtime/this-firefox`
2. 按 `Load Temporary Add-on...`
3. 選 `build/firefox-desktop-extension/manifest.json` 或 `build/firefox-android-extension/manifest.json`

如果你是直接把壓縮檔拖進 Firefox，Release 版通常會因為未簽名而拒絕，訊息看起來就像「corrupt」。

### Chrome 載不進去

Chrome 要用 unpacked 模式載入資料夾，不是載入 repo 根目錄，也不是載入壓縮檔：

1. 開 `chrome://extensions`
2. 打開 Developer mode
3. 選 `Load unpacked`
4. 指到 `build/chrome-extension/`

## Rust Diagnostics

如果你想直接檢查 Rust Core v2 對目前分頁的判斷，可以從設定頁按 `Rust Diagnostics`。

Diagnostics 頁會顯示：

- page classification
- quality warnings
- extracted outline / blocks
- top ranked blocks
- compressed prompt context
- diagnostics JSON / fixture draft export

這個頁面會直接對目前 active tab 執行：

- `classify_page(...)`
- `extract_article_blocks(...)`
- `process_article(...)`

## Rust Fixture Regression

如果你要批次檢查 Rust Core v2 的抽取與分類規則，可以執行：

```bash
bash scripts/run-rust-fixtures.sh
```

這會先 build wasm，再跑 `fixtures/rust-core-v2/manifest.json` 內定義的 fixtures，輸出：

- page classification
- confidence / safe flag
- block count
- prompt token usage
- top ranked blocks
- expectation mismatch

目前 fixture 定義在：

- `fixtures/rust-core-v2/manifest.json`

GitHub Actions 也會在 push / pull request 時自動執行同一套 Rust fixture regression。

## 目前行為

popup 會向 content script 要目前頁面的 HTML 與 metadata，再交給 `process_article(...)`。如果目標頁面是瀏覽器內建頁面，例如 `chrome://` 或 `about:`，extension 會直接回報無法擷取。
