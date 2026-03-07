# Fire Summary Store Listing Copy

Last updated: March 7, 2026

This file contains ready-to-use listing copy for Chrome Web Store and Firefox AMO submission forms.

## Product Positioning

- Product name: Fire Summary
- Suggested category: Productivity
- Homepage URL: https://github.com/pjiaquan/fire-summary
- Support URL: https://github.com/pjiaquan/fire-summary/issues
- Privacy policy URL: https://github.com/pjiaquan/fire-summary/blob/main/PRIVACY.md

## One-line Product Description

Fire Summary extracts the current webpage, generates a concise AI summary, and supports follow-up discussion in the browser.

## Chrome Web Store

### 建議摘要文案（繁體中文）

用 Gemini 快速摘要目前網頁，並在瀏覽器內直接延伸追問、整理重點與行動項目。

### 建議詳細說明（繁體中文）

Fire Summary 讓你不用離開目前頁面，就能把長文章整理成高訊號摘要。

當你開啟 extension 時，Fire Summary 會擷取目前頁面的文章內容，使用你自己的 Gemini API Key 送出請求，並回傳結構清楚的 Markdown 摘要。摘要完成後，你還可以進一步進入 discussion 模式，針對同一篇內容繼續追問。

主要功能：

- 直接摘要目前網頁內容
- 使用你自己的 Gemini API Key
- 針對摘要內容延伸討論與追問
- 自訂目標語言、Prompt 與排版設定
- 支援串流輸出，即時看到生成中的內容
- 可匯出摘要或討論結果
- 在瀏覽器本機快取摘要結果，加快重複查閱速度

適合用在：

- 閱讀長篇新聞或專欄
- 快速理解技術文章
- 做產品研究與競品整理
- 把網頁內容轉成可追問的 AI 工作流

注意事項：

- 當你主動要求摘要或延伸回覆時，Fire Summary 會把目前頁面的 URL、標題、摘要片段與擷取出的文章文字送到 Google Generative Language API。
- Extension 會在瀏覽器本機儲存設定與暫存摘要結果。
- `chrome://`、`about:` 這類瀏覽器內建頁面，因平台限制無法摘要。

### Suggested Short Description

Summarize any webpage with Gemini, then continue with follow-up discussion in a clean in-browser workflow.

### Detailed Description

Fire Summary helps you turn long webpages into high-signal summaries without leaving the page.

When you open the extension, Fire Summary extracts the current article, sends the page content to Gemini using your own API key, and returns a structured Markdown summary. After the summary is generated, you can continue the conversation with follow-up questions in a dedicated discussion view.

Key features:

- Summarize the active webpage directly from the browser.
- Use your own Gemini API key instead of a shared service.
- Continue with follow-up discussion based on the current summary.
- Choose target language, custom prompt, font settings, line height, and output style.
- Support streaming output for incremental summary generation.
- Export summaries or discussion results as text.
- Cache summary results locally in the browser for faster repeat access.

Fire Summary is designed for research, reading, product analysis, technical review, and quickly understanding long-form content.

Important notes:

- Fire Summary sends the current page URL, title, excerpt, and extracted article text to Google's Generative Language API when you explicitly request a summary or follow-up answer.
- The extension stores settings and temporary cached results in browser local storage.
- Browser internal pages such as `chrome://` and `about:` cannot be summarized due to browser platform restrictions.

### Suggested Store Bullet Highlights

- Fast AI summaries for long webpages
- Follow-up discussion on top of each summary
- Your own Gemini API key
- Traditional Chinese friendly UI
- Custom prompt and language controls

### Suggested Privacy Tab Answers

Use the following text to keep the store listing aligned with the current extension behavior:

- Single purpose:
  Summarize the current webpage and let the user continue with follow-up discussion based on that summary.
- Data sent off device:
  Current page URL, title, excerpt, extracted text, follow-up question text, and the user-provided Gemini API key are sent directly to Google's Generative Language API when the user requests summarization or follow-up generation.
- Data stored locally:
  Extension settings, temporary summary cache entries, current discussion context, and discussion history for the active summary flow.
- Not used for:
  Advertising, user profiling, data brokerage, or sale of user data.

### Suggested Screenshot Captions

- Generate a concise summary for the current article
- Continue with follow-up questions in discussion mode
- Tune target language, prompts, and typography in settings
- Stream summary output while Gemini is responding

## Firefox AMO

Firefox Extension Workshop says the add-on summary is limited to 250 characters, so keep the AMO summary short.

### AMO 摘要（繁體中文）

用 Gemini 摘要目前網頁，並直接延伸追問。Fire Summary 在瀏覽器內完成摘要與 follow-up discussion，使用你自己的 API Key，並只在本機保存設定與暫存資料。

### AMO 說明（繁體中文）

Fire Summary 幫你更快理解長網頁內容。

它會擷取目前頁面的文章文字，使用 Gemini 產生精簡摘要，並提供延伸討論模式，讓你可以根據同一份摘要繼續追問、比較觀點、整理行動項目。

你可以用 Fire Summary 做什麼：

- 摘要目前網頁
- 對摘要做 follow-up 問答
- 指定輸出語言與自訂 Prompt
- 調整字體、字重與行高
- 使用串流輸出模式
- 匯出摘要與討論內容

資料處理方式：

- 只有在你主動要求產生摘要或回覆時，Fire Summary 才會把目前頁面的 URL、標題、摘要片段、擷取文字與追問內容送到 Google Generative Language API。
- 設定、暫存摘要與目前討論上下文會保存在瀏覽器本機 storage。
- Fire Summary 不使用開發者自建後端來處理摘要請求。

### AMO Summary

Summarize the current webpage with Gemini, then continue with follow-up discussion. Fire Summary runs in the browser, uses your own API key, and stores settings and cached results locally.

### AMO Description

Fire Summary helps you understand long webpages faster.

The extension extracts the current page, generates a concise AI summary with Gemini, and opens a follow-up discussion workflow so you can ask deeper questions about the same content.

What you can do with Fire Summary:

- Summarize the active webpage.
- Ask follow-up questions based on the generated summary.
- Choose target language and custom prompts.
- Adjust font, weight, and line height for reading comfort.
- Use streaming output when supported by Gemini.
- Export generated content as text.

How it works:

1. Open Fire Summary on the current webpage.
2. Enter your own Gemini API key in Settings.
3. Generate a summary.
4. Continue into discussion mode for follow-up analysis.

Data handling:

- Fire Summary sends the current page URL, title, excerpt, extracted page text, and follow-up prompts to Google's Generative Language API only when the user requests generation.
- Settings and temporary cached data are stored locally in browser extension storage.
- Fire Summary does not run a developer-hosted backend for summary generation.

Support and policy links:

- Homepage: https://github.com/pjiaquan/fire-summary
- Support: https://github.com/pjiaquan/fire-summary/issues
- Privacy Policy: https://github.com/pjiaquan/fire-summary/blob/main/PRIVACY.md

### Suggested AMO Tags

- summary
- ai
- productivity
- reading
- gemini

### Suggested AMO Permission Explanation

- Access data for all websites:
  Needed to extract article content from the active page when the user asks for a summary.
- Storage:
  Needed to save user settings, summary cache entries, and discussion context.
- Access to `generativelanguage.googleapis.com`:
  Needed to send summary and follow-up requests directly to Gemini.

## Submission Checklist

Before submitting, prepare these assets and fields:

- Extension icon
- At least one screenshot
- Category set to Productivity
- Homepage URL
- Support URL
- Privacy policy URL
- Store description pasted from this file
- Release package from `bash scripts/package-extension.sh`

## Sources

- Chrome listing requirements: https://developer.chrome.com/docs/webstore/program-policies/listing-requirements/
- Chrome listing guidance: https://developer.chrome.com/docs/webstore/best-listing
- Chrome store listing dashboard: https://developer.chrome.com/docs/webstore/cws-dashboard-listing/
- Chrome store images: https://developer.chrome.com/docs/webstore/images
- Firefox listing guidance: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
