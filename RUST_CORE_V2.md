# Rust Core v2

## Goal

讓 Rust/Wasm 成為 Fire Summary 的內容理解核心，而不是只做輕量文字整理。

v2 的目標是把 Rust 提升成以下責任中心：

- article extraction
- content normalization
- salience ranking
- token budgeting
- prompt packaging
- deterministic quality checks

JS 保留 browser API、UI、storage、Gemini request orchestration。

## Why

目前 Rust 的價值不足夠明顯：

- content script 先取 `document.body.innerText`
- Rust 只在部分情況下走 HTML fallback
- JS 仍直接把大塊 `cleaned_text` 丟給 Gemini
- 快取、討論、streaming、UI 都在 JS

這讓 Rust 增加了 build/release 成本，但沒有形成足夠強的品質或性能優勢。

v2 要解決的是：

1. 提升正文抽取品質
2. 降低送給 Gemini 的低訊號內容比例
3. 降低 token 成本
4. 讓核心內容處理可測試、可重用

## Boundary

### Rust owns

- HTML-based article extraction
- DOM candidate scoring
- block-level normalization
- deduplication
- paragraph and heading segmentation
- salience scoring
- token budget estimation
- model-ready context packaging
- page quality classification

### JS owns

- browser integration
- content-script messaging
- settings UI
- local/session storage
- Gemini API requests
- discussion UX
- export / clipboard / tabs

## Target Architecture

### Input from content script to Rust

目前 input 太薄，v2 改成傳完整 page signals：

```ts
type ArticleExtractionInput = {
  url: string | null;
  title: string | null;
  lang: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  byline: string | null;
  publishedTime: string | null;
  selectionText: string | null;
  html: string | null;
};
```

原則：

- `html` 應該成為主要來源，不是 fallback
- `selectionText` 可做未來的「只摘要選取內容」
- `url/lang/meta/canonical` 都應進入 scoring 與 packaging

### Output from Rust to JS

JS 不再只拿一條 `cleaned_text`，而是拿一個結構化文件：

```ts
type ProcessedArticle = {
  article: {
    title: string | null;
    canonicalUrl: string | null;
    excerpt: string | null;
    byline: string | null;
    publishedTime: string | null;
    source: "html-primary" | "selection" | "fallback";
  };
  outline: OutlineNode[];
  blocks: ArticleBlock[];
  rankedBlocks: RankedBlock[];
  promptPayload: PromptPayload;
  quality: QualityReport;
  stats: ProcessingStats;
};
```

### Core structs in Rust

```rust
pub struct ArticleBlock {
    pub id: String,
    pub kind: BlockKind,
    pub text: String,
    pub heading_path: Vec<String>,
    pub char_count: usize,
    pub estimated_tokens: usize,
    pub position: usize,
}

pub enum BlockKind {
    Heading,
    Paragraph,
    ListItem,
    Quote,
    Code,
}

pub struct RankedBlock {
    pub block_id: String,
    pub score: f64,
    pub reasons: Vec<String>,
}

pub struct PromptPayload {
    pub system_context: String,
    pub article_header: String,
    pub compressed_context: String,
    pub key_points: Vec<String>,
    pub supporting_blocks: Vec<String>,
    pub token_budget_used: usize,
}

pub struct QualityReport {
    pub page_type: PageType,
    pub confidence: f64,
    pub warnings: Vec<String>,
    pub safe_to_summarize: bool,
}
```

## Processing Pipeline

### Phase 1. Extract

輸入完整 HTML，建立候選內容節點。

Steps:

1. parse HTML
2. remove ignored regions
3. score candidate containers
4. choose best container
5. extract heading / paragraph / list blocks

改善方向：

- 現在的 `article, main, section, div` scoring 可以保留，但要擴展到 block tree
- link density / semantic bonus 不只決定最佳容器，也要參與 block pruning

### Phase 2. Normalize

對 block 做穩定清洗：

- trim noise
- merge broken paragraphs
- remove repeated lines
- drop boilerplate
- collapse share / subscribe / related-content artifacts
- normalize punctuation / whitespace

這一層的輸出應該是乾淨、可排序的 block list。

### Phase 3. Classify

判斷頁面是否值得摘要：

- article page
- index/listing page
- search results page
- login/paywall page
- product page
- forum/chat page

如果不是典型 article page，Rust 應回：

- `safe_to_summarize = false`
- warnings
- fallback strategy

這能避免把低品質頁面直接送給 Gemini。

### Phase 4. Rank

以 block 為單位打分，而不是只做句子摘取。

建議特徵：

- title overlap
- meta description overlap
- heading depth
- position bonus
- paragraph density
- named entity density
- number density
- emphasis signals
- novelty score
- duplicate penalty

這層產出：

- `rankedBlocks`
- `score reasons`

### Phase 5. Budget

根據 model 與設定決定可送進 Gemini 的內容量。

最少支援：

- target max input tokens
- reserved output tokens
- min lead coverage
- max blocks

策略：

1. 保留 title / metadata
2. 優先保留高分 blocks
3. 避免全都擠在開頭段落
4. 至少保留不同 heading path 的 coverage

這一層是 Rust 非常值得保留的點，因為：

- 規則明確
- 成本可測
- 和 model orchestration 解耦

### Phase 6. Package

Rust 最後輸出 prompt-ready payload，而不是 JS 自己拼全文。

JS 之後只要做：

```js
const payload = processedArticle.promptPayload;
sendToGemini(payload);
```

這樣 prompt engineering 的上下文控制，就不再散落在 JS。

## Recommended API Surface

### Keep

- `summarize_article(...)`

### Replace with

```rust
#[wasm_bindgen]
pub fn process_article(input: JsValue) -> Result<JsValue, JsValue>;
```

`process_article` 要做的是：

- extraction
- normalization
- ranking
- budgeting
- packaging

不在 Rust 裡直接調 LLM。

### Optional helper exports

```rust
#[wasm_bindgen]
pub fn extract_article_blocks(html: &str) -> Result<JsValue, JsValue>;

#[wasm_bindgen]
pub fn classify_page(html: &str) -> Result<JsValue, JsValue>;
```

這兩個 helper 對測試與 debug 很有價值。

## JS Migration Plan

### Current

JS 現在把這些文字送進 Gemini：

- title
- url
- excerpt
- cleaned_text

### v2

JS 改成送：

- `promptPayload.system_context`
- `promptPayload.article_header`
- `promptPayload.compressed_context`
- `promptPayload.key_points`
- `promptPayload.supporting_blocks`

也就是從「傳全文」改成「傳經 Rust 壓縮後的 context package」。

## Testing Strategy

Rust 值不值得保留，很大一部分取決於可測試性。

### Add fixture tests

建立 `fixtures/`：

- news article
- long-form blog
- docs page
- product landing page
- search result page
- noisy portal page
- mixed Chinese / English page

每個 fixture 驗證：

- extracted title
- block count
- top-ranked block ids
- page type
- safe_to_summarize
- token budget result

### Add regression cases

特別保留：

- duplicated nav text
- low-quality list pages
- very long pages
- pages with lots of links
- pages with hidden boilerplate

## Implementation Phases

### Phase A: Extraction v2

Deliverables:

- `process_article`
- structured blocks
- outline
- source metadata

Acceptance:

- 不再只依賴 `innerText`
- 主要文章頁 fixture 的正文抽取品質明顯提升

### Phase B: Ranking + Budgeting

Deliverables:

- ranked blocks
- token estimation
- compression report
- selected block set

Acceptance:

- Gemini input chars 顯著下降
- 摘要品質不下降或提升

### Phase C: Prompt Payload v2

Deliverables:

- Rust 直接輸出 prompt payload
- JS 不再手拼全文 prompt

Acceptance:

- popup / discussion 使用同一套 payload contract
- prompt 結構更穩定

## Non-goals

v2 不做：

- Rust 直接呼叫 Gemini API
- 在 Rust 內做瀏覽器 API 操作
- 在 Rust 內做 UI rendering
- 過早引入 embedding / ML model

## Success Criteria

如果做完 v2，Rust 保留的理由應該很明確：

1. 正文抽取品質高於單純 JS `innerText`
2. Gemini input 明顯更短、更乾淨
3. 成本下降可量化
4. block ranking / page classification 可寫 fixture regression tests
5. JS 顯著簡化成 orchestration layer

## Immediate Next Tasks

1. 新增 `process_article(input)` 與 `ProcessedArticle` 結構
2. content script 改成優先傳 `html` 與 page metadata
3. Rust 回傳 `blocks` 與 `outline`
4. popup.js 改用 `promptPayload` 而不是 `cleaned_text`
5. 建立第一批 extraction fixtures
