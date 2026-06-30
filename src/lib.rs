use scraper::{ElementRef, Html, Node, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

const MIN_BLOCK_CHARS: usize = 40;
const MIN_LIST_ITEM_CHARS: usize = 20;
const MIN_HEADING_CHARS: usize = 4;
const MIN_CODE_BLOCK_CHARS: usize = 16;
const MIN_TABLE_BLOCK_CHARS: usize = 20;
const MIN_SELECTION_CHARS: usize = 80;
const DEFAULT_SUMMARY_SENTENCES: usize = 3;
const DEFAULT_SUMMARY_CHARS: usize = 320;
const DEFAULT_PROMPT_CHARS: usize = 3600;
const DEFAULT_PROMPT_TOKENS: usize = 900;
const MAX_SOURCE_CHARS: usize = 12_000;
const MAX_PROMPT_CHARS: usize = 6000;
const MAX_PROMPT_TOKENS: usize = 1600;
const MAX_SUPPORTING_BLOCKS: usize = 6;
const MAX_DISCUSSION_SUPPORTING_BLOCKS_HARD_CAP: usize = 40;
const DISCUSSION_WINDOW_COUNT: usize = 5;
const READABILITY_MIN_SCORE_CHARS: usize = 25;
const READABILITY_SCORE_ANCESTOR_DEPTH: usize = 5;
const READABILITY_SIBLING_SCORE_FLOOR: f64 = 10.0;
const SENTENCE_SPLITTERS: [char; 8] = ['。', '！', '？', '.', '!', '?', ';', '；'];
const IGNORED_TAGS: [&str; 12] = [
    "nav", "aside", "footer", "header", "script", "style", "noscript", "form", "button", "svg",
    "canvas", "template",
];
const READABILITY_UNLIKELY_FRAGMENTS: [&str; 27] = [
    "-ad-",
    "ai2html",
    "banner",
    "breadcrumbs",
    "combx",
    "comment",
    "community",
    "cover-wrap",
    "disqus",
    "extra",
    "footer",
    "gdpr",
    "header",
    "legends",
    "menu",
    "related",
    "remark",
    "replies",
    "rss",
    "shoutbox",
    "sidebar",
    "skyscraper",
    "social",
    "sponsor",
    "supplemental",
    "pager",
    "popup",
];
const READABILITY_OK_MAYBE_FRAGMENTS: [&str; 8] = [
    "and", "article", "body", "column", "content", "main", "mathjax", "shadow",
];
const READABILITY_POSITIVE_FRAGMENTS: [&str; 12] = [
    "article",
    "body",
    "content",
    "entry",
    "hentry",
    "h-entry",
    "main",
    "page",
    "pagination",
    "post",
    "blog",
    "story",
];
const READABILITY_NEGATIVE_FRAGMENTS: [&str; 24] = [
    "-ad-",
    "hidden",
    "banner",
    "combx",
    "comment",
    "com-",
    "contact",
    "footer",
    "gdpr",
    "masthead",
    "media",
    "meta",
    "outbrain",
    "promo",
    "related",
    "scroll",
    "share",
    "shoutbox",
    "sidebar",
    "skyscraper",
    "sponsor",
    "shopping",
    "tags",
    "widget",
];

#[derive(Debug, Deserialize)]
pub struct ArticleInput {
    pub url: Option<String>,
    pub title: Option<String>,
    pub lang: Option<String>,
    #[serde(alias = "metaDescription", alias = "excerpt")]
    pub meta_description: Option<String>,
    #[serde(alias = "canonicalUrl")]
    pub canonical_url: Option<String>,
    pub byline: Option<String>,
    #[serde(alias = "publishedTime")]
    pub published_time: Option<String>,
    #[serde(alias = "selectionText")]
    pub selection_text: Option<String>,
    #[serde(alias = "textContent", alias = "text")]
    pub text_content: Option<String>,
    pub html: Option<String>,
    pub max_sentences: Option<usize>,
    pub max_chars: Option<usize>,
    #[serde(alias = "maxPromptChars")]
    pub max_prompt_chars: Option<usize>,
    #[serde(alias = "maxPromptTokens")]
    pub max_prompt_tokens: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct ProcessedArticleResult {
    pub title: Option<String>,
    #[serde(rename = "cleaned_text")]
    pub cleaned_text: String,
    pub summary: String,
    pub excerpt: Option<String>,
    pub source: String,
    pub stats: SummaryStats,
    pub article: ArticleMetadata,
    pub outline: Vec<OutlineNode>,
    pub blocks: Vec<ArticleBlock>,
    #[serde(rename = "rankedBlocks")]
    pub ranked_blocks: Vec<RankedBlock>,
    #[serde(rename = "promptPayload")]
    pub prompt_payload: PromptPayload,
    pub quality: QualityReport,
}

#[derive(Debug, Serialize)]
pub struct BlockExtractionResult {
    #[serde(rename = "cleaned_text")]
    pub cleaned_text: String,
    pub source: String,
    pub outline: Vec<OutlineNode>,
    pub blocks: Vec<ArticleBlock>,
    pub quality: QualityReport,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageClassificationResult {
    pub page_type: PageType,
    pub confidence: f64,
    pub warnings: Vec<String>,
    pub safe_to_summarize: bool,
    pub source: String,
    pub cleaned_chars: usize,
    pub block_count: usize,
}

#[derive(Debug, Serialize)]
pub struct SummaryStats {
    pub cleaned_chars: usize,
    pub sentence_count: usize,
    pub selected_sentences: usize,
    pub block_count: usize,
    pub prompt_chars: usize,
    pub estimated_tokens: usize,
    pub prompt_tokens: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleMetadata {
    pub title: Option<String>,
    pub url: Option<String>,
    pub canonical_url: Option<String>,
    pub excerpt: Option<String>,
    pub byline: Option<String>,
    pub published_time: Option<String>,
    pub language: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleBlock {
    pub id: String,
    pub kind: BlockKind,
    pub text: String,
    pub heading_path: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading_level: Option<u8>,
    pub char_count: usize,
    pub estimated_tokens: usize,
    pub position: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BlockKind {
    Heading,
    Paragraph,
    ListItem,
    Quote,
    Code,
    Table,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineNode {
    pub title: String,
    pub level: u8,
    pub block_id: String,
    pub position: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankedBlock {
    pub block_id: String,
    pub score: f64,
    pub reasons: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptPayload {
    pub article_header: String,
    pub compressed_context: String,
    pub key_points: Vec<String>,
    pub supporting_blocks: Vec<String>,
    pub token_budget_used: usize,
    pub token_budget_target: usize,
    pub selection_strategy: String,
}

#[derive(Debug)]
struct PromptSelection {
    supporting_blocks: Vec<String>,
    selection_strategy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityReport {
    pub page_type: PageType,
    pub confidence: f64,
    pub warnings: Vec<String>,
    pub safe_to_summarize: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PageType {
    Article,
    Selection,
    DocsPage,
    SearchResults,
    ListingPage,
    ProductPage,
    DiscussionThread,
    PaywalledPage,
    SparsePage,
    GenericPage,
}

#[derive(Debug, Clone)]
struct SentenceCandidate {
    index: usize,
    text: String,
    score: f64,
}

struct ProcessingOutput {
    title: Option<String>,
    excerpt: Option<String>,
    cleaned_text: String,
    summary: String,
    source: String,
    stats: SummaryStats,
    article: ArticleMetadata,
    outline: Vec<OutlineNode>,
    blocks: Vec<ArticleBlock>,
    ranked_blocks: Vec<RankedBlock>,
    prompt_payload: PromptPayload,
    quality: QualityReport,
}

struct StructuredExtraction {
    blocks: Vec<ArticleBlock>,
    cleaned_text: String,
    outline: Vec<OutlineNode>,
    source: String,
    quality: QualityReport,
}

struct ReadabilityCandidateSelection<'a> {
    top_candidate: ElementRef<'a>,
    top_score: f64,
    candidate_scores: HashMap<ego_tree::NodeId, f64>,
}

#[wasm_bindgen]
pub fn extract_main_content(html: &str) -> String {
    extract_main_text_from_html(html)
}

#[wasm_bindgen]
pub fn extract_and_summarize(html: &str) -> String {
    let cleaned_text = extract_main_text_from_html(html);
    if cleaned_text.is_empty() {
        return "無法提取有效的網頁內容。".to_string();
    }

    let summary = build_summary(
        None,
        &cleaned_text,
        None,
        DEFAULT_SUMMARY_SENTENCES,
        DEFAULT_SUMMARY_CHARS,
    );

    format!(
        "【自動提取完成】內容長度：{} 字。\n摘要：{}",
        cleaned_text.chars().count(),
        summary
    )
}

#[wasm_bindgen]
pub fn summarize_article(input: JsValue) -> Result<JsValue, JsValue> {
    process_article(input)
}

#[wasm_bindgen]
pub fn process_article(input: JsValue) -> Result<JsValue, JsValue> {
    let input: ArticleInput = serde_wasm_bindgen::from_value(input)
        .map_err(|err| JsValue::from_str(&format!("invalid input: {err}")))?;

    let processed = process_article_input(input).map_err(|err| JsValue::from_str(&err))?;
    let result = ProcessedArticleResult {
        title: processed.title,
        cleaned_text: processed.cleaned_text,
        summary: processed.summary,
        excerpt: processed.excerpt,
        source: processed.source,
        stats: processed.stats,
        article: processed.article,
        outline: processed.outline,
        blocks: processed.blocks,
        ranked_blocks: processed.ranked_blocks,
        prompt_payload: processed.prompt_payload,
        quality: processed.quality,
    };

    serde_wasm_bindgen::to_value(&result).map_err(|err| {
        JsValue::from_str(&format!(
            "failed to serialize processed article result: {err}"
        ))
    })
}

#[wasm_bindgen]
pub fn extract_article_blocks(input: JsValue) -> Result<JsValue, JsValue> {
    let input: ArticleInput = serde_wasm_bindgen::from_value(input)
        .map_err(|err| JsValue::from_str(&format!("invalid input: {err}")))?;
    let title = normalize_optional(&input.title);
    let url = normalize_optional(&input.url);
    let extracted = if let Some(selection) = normalize_optional(&input.selection_text) {
        if selection.chars().count() >= MIN_SELECTION_CHARS {
            build_selection_extraction(&selection, title.as_deref(), url.as_deref())
        } else {
            extract_from_page(
                &input.html,
                &input.text_content,
                title.as_deref(),
                url.as_deref(),
            )
        }
    } else {
        extract_from_page(
            &input.html,
            &input.text_content,
            title.as_deref(),
            url.as_deref(),
        )
    }
    .ok_or_else(|| JsValue::from_str("no usable article text"))?;

    let result = BlockExtractionResult {
        cleaned_text: extracted.cleaned_text,
        source: extracted.source,
        outline: extracted.outline,
        blocks: extracted.blocks,
        quality: extracted.quality,
    };

    serde_wasm_bindgen::to_value(&result).map_err(|err| {
        JsValue::from_str(&format!(
            "failed to serialize block extraction result: {err}"
        ))
    })
}

#[wasm_bindgen]
pub fn classify_page(input: JsValue) -> Result<JsValue, JsValue> {
    let input: ArticleInput = serde_wasm_bindgen::from_value(input)
        .map_err(|err| JsValue::from_str(&format!("invalid input: {err}")))?;
    let title = normalize_optional(&input.title);
    let url = normalize_optional(&input.url);
    let extracted = if let Some(selection) = normalize_optional(&input.selection_text) {
        if selection.chars().count() >= MIN_SELECTION_CHARS {
            build_selection_extraction(&selection, title.as_deref(), url.as_deref())
        } else {
            extract_from_page(
                &input.html,
                &input.text_content,
                title.as_deref(),
                url.as_deref(),
            )
        }
    } else {
        extract_from_page(
            &input.html,
            &input.text_content,
            title.as_deref(),
            url.as_deref(),
        )
    }
    .ok_or_else(|| JsValue::from_str("no usable article text"))?;

    let result = PageClassificationResult {
        page_type: extracted.quality.page_type.clone(),
        confidence: extracted.quality.confidence,
        warnings: extracted.quality.warnings.clone(),
        safe_to_summarize: extracted.quality.safe_to_summarize,
        source: extracted.source,
        cleaned_chars: extracted.cleaned_text.chars().count(),
        block_count: extracted.blocks.len(),
    };

    serde_wasm_bindgen::to_value(&result).map_err(|err| {
        JsValue::from_str(&format!("failed to serialize page classification: {err}"))
    })
}

fn process_article_input(input: ArticleInput) -> Result<ProcessingOutput, String> {
    let max_sentences = input
        .max_sentences
        .unwrap_or(DEFAULT_SUMMARY_SENTENCES)
        .max(1);
    let max_chars = input.max_chars.unwrap_or(DEFAULT_SUMMARY_CHARS).max(120);
    let max_prompt_chars = input
        .max_prompt_chars
        .unwrap_or(DEFAULT_PROMPT_CHARS)
        .clamp(1200, MAX_PROMPT_CHARS);
    let max_prompt_tokens = input
        .max_prompt_tokens
        .unwrap_or(DEFAULT_PROMPT_TOKENS)
        .clamp(320, MAX_PROMPT_TOKENS);

    let selection_text = normalize_optional(&input.selection_text);
    let title = normalize_optional(&input.title);
    let excerpt = normalize_optional(&input.meta_description);
    let source_url = normalize_optional(&input.url);
    let canonical_url = normalize_optional(&input.canonical_url).or_else(|| source_url.clone());
    let byline = normalize_optional(&input.byline);
    let published_time = normalize_optional(&input.published_time);
    let language = normalize_optional(&input.lang);

    let extracted = if let Some(selection) = selection_text.clone() {
        if selection.chars().count() >= MIN_SELECTION_CHARS {
            build_selection_extraction(&selection, title.as_deref(), source_url.as_deref())
        } else {
            extract_from_page(
                &input.html,
                &input.text_content,
                title.as_deref(),
                source_url.as_deref(),
            )
        }
    } else {
        extract_from_page(
            &input.html,
            &input.text_content,
            title.as_deref(),
            source_url.as_deref(),
        )
    };

    let extracted = extracted.ok_or_else(|| "no usable article text".to_string())?;
    let summary = build_summary(
        title.as_deref(),
        &extracted.cleaned_text,
        excerpt.as_deref(),
        max_sentences,
        max_chars,
    );
    let ranked_blocks = rank_blocks(
        &extracted.blocks,
        title.as_deref(),
        excerpt.as_deref(),
        &extracted.quality.page_type,
    );
    let article = ArticleMetadata {
        title: title.clone(),
        url: source_url,
        canonical_url,
        excerpt: excerpt.clone(),
        byline,
        published_time,
        language,
        source: extracted.source.clone(),
    };
    let prompt_payload = build_prompt_payload(
        &article,
        &extracted.cleaned_text,
        &summary,
        &extracted.blocks,
        &ranked_blocks,
        &extracted.quality,
        max_prompt_chars,
        max_prompt_tokens,
    );
    let stats = SummaryStats {
        cleaned_chars: extracted.cleaned_text.chars().count(),
        sentence_count: split_sentences(&extracted.cleaned_text).len(),
        selected_sentences: split_sentences(&summary).len(),
        block_count: extracted.blocks.len(),
        prompt_chars: prompt_payload.compressed_context.chars().count(),
        estimated_tokens: estimate_tokens(&prompt_payload.compressed_context),
        prompt_tokens: prompt_payload.token_budget_used,
    };

    Ok(ProcessingOutput {
        title,
        excerpt,
        cleaned_text: extracted.cleaned_text,
        summary,
        source: extracted.source,
        stats,
        article,
        outline: extracted.outline,
        blocks: extracted.blocks,
        ranked_blocks,
        prompt_payload,
        quality: extracted.quality,
    })
}

fn build_selection_extraction(
    selection_text: &str,
    title: Option<&str>,
    url: Option<&str>,
) -> Option<StructuredExtraction> {
    let mut blocks = Vec::new();

    for (index, paragraph) in selection_text
        .split("\n\n")
        .map(normalize_text)
        .filter(|text| text.chars().count() >= MIN_BLOCK_CHARS)
        .enumerate()
    {
        blocks.push(ArticleBlock {
            id: format!("block-{}", index + 1),
            kind: BlockKind::Paragraph,
            text: paragraph.clone(),
            heading_path: Vec::new(),
            heading_level: None,
            char_count: paragraph.chars().count(),
            estimated_tokens: estimate_tokens(&paragraph),
            position: index,
        });
    }

    if blocks.is_empty() {
        let normalized = normalize_text(selection_text);
        if normalized.chars().count() < MIN_SELECTION_CHARS {
            return None;
        }

        blocks.push(ArticleBlock {
            id: "block-1".to_string(),
            kind: BlockKind::Paragraph,
            text: normalized.clone(),
            heading_path: Vec::new(),
            heading_level: None,
            char_count: normalized.chars().count(),
            estimated_tokens: estimate_tokens(&normalized),
            position: 0,
        });
    }

    let cleaned_text = join_block_text(&blocks);
    let quality = assess_quality(&blocks, &cleaned_text, "selection", title, url);

    Some(StructuredExtraction {
        outline: build_outline(&blocks),
        blocks,
        cleaned_text,
        source: "selection".to_string(),
        quality,
    })
}

fn extract_from_page(
    html: &Option<String>,
    text_content: &Option<String>,
    title: Option<&str>,
    url: Option<&str>,
) -> Option<StructuredExtraction> {
    if let Some(html) = html.as_deref() {
        if let Some(extracted) = extract_structured_from_html(html, title, url) {
            if should_consider_visible_text_fallback(&extracted) {
                let text_fallback = text_content
                    .as_deref()
                    .and_then(|text| build_text_fallback_extraction(text, title, url));
                return Some(choose_page_extraction(extracted, text_fallback));
            }

            return Some(extracted);
        }
    }

    text_content
        .as_deref()
        .and_then(|text| build_text_fallback_extraction(text, title, url))
}

fn choose_page_extraction(
    html_extraction: StructuredExtraction,
    text_fallback: Option<StructuredExtraction>,
) -> StructuredExtraction {
    let Some(mut text_extraction) = text_fallback else {
        return html_extraction;
    };

    if should_prefer_visible_text_fallback(&html_extraction, &text_extraction) {
        text_extraction.quality.warnings.push(
            "HTML extraction looked incomplete, so visible page text was used instead.".to_string(),
        );
        return text_extraction;
    }

    html_extraction
}

fn should_prefer_visible_text_fallback(
    html_extraction: &StructuredExtraction,
    text_extraction: &StructuredExtraction,
) -> bool {
    if !text_extraction.quality.safe_to_summarize {
        return false;
    }

    let html_chars = html_extraction.cleaned_text.chars().count();
    let text_chars = text_extraction.cleaned_text.chars().count();
    if text_chars < 260 || text_chars < html_chars.saturating_add(220) {
        return false;
    }

    let text_content_blocks = text_extraction
        .blocks
        .iter()
        .filter(|block| !matches!(block.kind, BlockKind::Heading))
        .count();
    if text_content_blocks < 2 {
        return false;
    }

    if !html_extraction.quality.safe_to_summarize {
        return text_chars >= html_chars.saturating_mul(2);
    }

    if !is_article_like_page_type(&html_extraction.quality.page_type) {
        return text_chars >= html_chars.saturating_mul(3);
    }

    false
}

fn should_consider_visible_text_fallback(extraction: &StructuredExtraction) -> bool {
    !extraction.quality.safe_to_summarize
        || !is_article_like_page_type(&extraction.quality.page_type)
}

fn is_article_like_page_type(page_type: &PageType) -> bool {
    matches!(
        page_type,
        PageType::Article | PageType::Selection | PageType::DocsPage
    )
}

fn build_text_fallback_extraction(
    text_content: &str,
    title: Option<&str>,
    url: Option<&str>,
) -> Option<StructuredExtraction> {
    let blocks = extract_text_fallback_blocks(text_content);

    if blocks.is_empty() {
        let cleaned_text = normalize_text(text_content);
        if cleaned_text.chars().count() < 10 {
            return None;
        }

        let block = ArticleBlock {
            id: "block-1".to_string(),
            kind: BlockKind::Paragraph,
            text: cleaned_text.clone(),
            heading_path: Vec::new(),
            heading_level: None,
            char_count: cleaned_text.chars().count(),
            estimated_tokens: estimate_tokens(&cleaned_text),
            position: 0,
        };
        let blocks = vec![block];
        let quality = assess_quality(&blocks, &cleaned_text, "text-fallback", title, url);

        return Some(StructuredExtraction {
            outline: Vec::new(),
            blocks,
            cleaned_text,
            source: "text-fallback".to_string(),
            quality,
        });
    }

    let blocks = normalize_structured_blocks(blocks);
    if blocks.is_empty() {
        return None;
    }

    let cleaned_text = join_block_text(&blocks);
    let quality = assess_quality(&blocks, &cleaned_text, "text-fallback", title, url);

    Some(StructuredExtraction {
        outline: build_outline(&blocks),
        blocks,
        cleaned_text,
        source: "text-fallback".to_string(),
        quality,
    })
}

fn extract_text_fallback_blocks(text_content: &str) -> Vec<ArticleBlock> {
    let normalized_lines = text_content
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .split('\n')
        .map(normalize_text)
        .collect::<Vec<_>>();
    let mut paragraphs = Vec::new();
    let mut current_lines = Vec::new();

    for line in &normalized_lines {
        if line.is_empty() {
            push_text_fallback_paragraph(&mut paragraphs, &mut current_lines);
        } else {
            current_lines.push(line.clone());
        }
    }
    push_text_fallback_paragraph(&mut paragraphs, &mut current_lines);

    let mut texts = paragraphs
        .into_iter()
        .filter(|text| {
            text.chars().count() >= MIN_BLOCK_CHARS && !is_probable_visible_text_boilerplate(text)
        })
        .collect::<Vec<_>>();

    if texts.len() < 2 {
        texts = normalized_lines
            .into_iter()
            .filter(|text| {
                text.chars().count() >= MIN_BLOCK_CHARS
                    && !is_probable_visible_text_boilerplate(text)
            })
            .collect();
    }

    if texts.len() < 2 {
        texts = group_sentences_for_text_fallback(text_content);
    }

    texts_to_text_fallback_blocks(texts)
}

fn push_text_fallback_paragraph(paragraphs: &mut Vec<String>, current_lines: &mut Vec<String>) {
    if current_lines.is_empty() {
        return;
    }

    let paragraph = normalize_text(&current_lines.join(" "));
    if !paragraph.is_empty() {
        paragraphs.push(paragraph);
    }
    current_lines.clear();
}

fn group_sentences_for_text_fallback(text_content: &str) -> Vec<String> {
    const TARGET_BLOCK_CHARS: usize = 480;

    let normalized = normalize_text(text_content);
    let sentences = split_sentences(&normalized);
    let mut grouped = Vec::new();
    let mut current = String::new();

    for sentence in sentences {
        let current_chars = current.chars().count();
        let sentence_chars = sentence.chars().count();
        let separator_chars = if current.is_empty() { 0 } else { 1 };

        if !current.is_empty()
            && current_chars + separator_chars + sentence_chars > TARGET_BLOCK_CHARS
        {
            if current.chars().count() >= MIN_BLOCK_CHARS
                && !is_probable_visible_text_boilerplate(&current)
            {
                grouped.push(current);
            }
            current = String::new();
        }

        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(&sentence);
    }

    if current.chars().count() >= MIN_BLOCK_CHARS && !is_probable_visible_text_boilerplate(&current)
    {
        grouped.push(current);
    }

    grouped
}

fn is_probable_visible_text_boilerplate(text: &str) -> bool {
    if text.chars().count() >= 160 {
        return false;
    }

    is_probable_boilerplate(text)
}

fn texts_to_text_fallback_blocks(texts: Vec<String>) -> Vec<ArticleBlock> {
    let mut blocks = Vec::new();
    let mut seen = HashSet::new();

    for text in texts {
        if !seen.insert(text.clone()) {
            continue;
        }

        let position = blocks.len();
        blocks.push(ArticleBlock {
            id: format!("block-{}", position + 1),
            kind: BlockKind::Paragraph,
            text: text.clone(),
            heading_path: Vec::new(),
            heading_level: None,
            char_count: text.chars().count(),
            estimated_tokens: estimate_tokens(&text),
            position,
        });
    }

    blocks
}

fn extract_main_text_from_html(html: &str) -> String {
    extract_structured_from_html(html, None, None)
        .map(|extracted| extracted.cleaned_text)
        .unwrap_or_default()
}

fn extract_structured_from_html(
    html: &str,
    title: Option<&str>,
    url: Option<&str>,
) -> Option<StructuredExtraction> {
    let document = Html::parse_document(html);
    let best_candidate = select_readability_candidate(&document);

    let mut blocks = if let Some(selection) = best_candidate {
        extract_candidate_with_siblings(selection)
    } else if let Some(candidate) = find_best_candidate(&document) {
        extract_structured_blocks(candidate)
    } else {
        Vec::new()
    };
    let source = if blocks.is_empty() {
        "html-fallback"
    } else {
        "html-primary"
    };

    if blocks.is_empty() {
        blocks = extract_discussion_blocks(&document);
    }

    if blocks.is_empty() {
        blocks = extract_fallback_blocks(&document);
    }

    let blocks = normalize_structured_blocks(blocks);
    if blocks.is_empty() {
        return None;
    }

    let cleaned_text = truncate_chars(&join_block_text(&blocks), MAX_SOURCE_CHARS);
    let quality = assess_quality(&blocks, &cleaned_text, source, title, url);

    Some(StructuredExtraction {
        outline: build_outline(&blocks),
        blocks,
        cleaned_text,
        source: source.to_string(),
        quality,
    })
}

fn find_best_candidate<'a>(document: &'a Html) -> Option<ElementRef<'a>> {
    let preferred = Selector::parse(
        "article, main, [role='main'], .article, .article-body, .article-content, .post, \
         .post-content, .entry-content, .content, #content",
    )
    .expect("valid selector");
    let generic = Selector::parse("section, div").expect("valid selector");

    let preferred_best = score_candidates(document.select(&preferred).collect::<Vec<_>>());
    let generic_best = score_candidates(document.select(&generic).collect::<Vec<_>>());

    match (preferred_best, generic_best) {
        (Some((preferred_score, preferred_node)), Some((generic_score, generic_node))) => {
            if is_discussion_like_element(generic_node)
                && !is_discussion_like_element(preferred_node)
            {
                Some(preferred_node)
            } else if preferred_score * 0.9 >= generic_score {
                Some(preferred_node)
            } else {
                Some(generic_node)
            }
        }
        (Some((_, node)), None) | (None, Some((_, node))) => Some(node),
        (None, None) => None,
    }
}

fn select_readability_candidate<'a>(
    document: &'a Html,
) -> Option<ReadabilityCandidateSelection<'a>> {
    let selector = Selector::parse("section, h2, h3, h4, h5, h6, p, td, pre, blockquote, div")
        .expect("valid selector");
    let mut candidate_scores = HashMap::new();
    let mut candidate_nodes = HashMap::new();

    for element in document.select(&selector) {
        if is_inside_ignored_context(element) || is_unlikely_candidate(element) {
            continue;
        }

        let text = block_text_from_element(element);
        if text.chars().count() < READABILITY_MIN_SCORE_CHARS {
            continue;
        }

        let content_score = readability_content_score(&text);
        if content_score <= 0.0 {
            continue;
        }

        for (level, ancestor) in element
            .ancestors()
            .filter_map(ElementRef::wrap)
            .skip(1)
            .take(READABILITY_SCORE_ANCESTOR_DEPTH)
            .enumerate()
        {
            if matches!(ancestor.value().name(), "html" | "body") {
                continue;
            }
            if is_inside_ignored_context(ancestor) || is_unlikely_candidate(ancestor) {
                continue;
            }

            let node_id = ancestor.id();
            candidate_nodes.entry(node_id).or_insert(ancestor);
            let entry = candidate_scores
                .entry(node_id)
                .or_insert_with(|| readability_initialize_score(ancestor));
            *entry += content_score / readability_ancestor_divider(level);
        }
    }

    let mut top_candidate = None;
    let mut top_score = 0.0f64;

    for (node_id, candidate) in candidate_nodes {
        let Some(raw_score) = candidate_scores.get(&node_id).copied() else {
            continue;
        };
        let adjusted_score = raw_score * (1.0 - get_link_density_readability(candidate));
        if adjusted_score > top_score {
            top_score = adjusted_score;
            top_candidate = Some(candidate);
        }
    }

    let mut top_candidate = top_candidate?;
    top_score = top_score.max(0.0);

    let mut last_score = top_score;
    let score_threshold = (top_score / 3.0).max(5.0);
    while let Some(parent) = top_candidate.parent().and_then(ElementRef::wrap) {
        if parent.value().name() == "body" {
            break;
        }

        let parent_score = candidate_scores
            .get(&parent.id())
            .copied()
            .unwrap_or_default();
        if parent_score < score_threshold {
            break;
        }
        if parent_score > last_score {
            top_candidate = parent;
            last_score = parent_score;
            continue;
        }
        break;
    }

    while let Some(parent) = top_candidate.parent().and_then(ElementRef::wrap) {
        if parent.value().name() == "body" || parent.child_elements().count() != 1 {
            break;
        }
        top_candidate = parent;
    }

    Some(ReadabilityCandidateSelection {
        top_candidate,
        top_score: top_score.max(last_score),
        candidate_scores,
    })
}

fn extract_candidate_with_siblings(
    selection: ReadabilityCandidateSelection<'_>,
) -> Vec<ArticleBlock> {
    let mut blocks = Vec::new();
    let mut seen_siblings = HashSet::new();
    let top_candidate = selection.top_candidate;

    if let Some(parent) = top_candidate.parent().and_then(ElementRef::wrap) {
        let sibling_threshold = READABILITY_SIBLING_SCORE_FLOOR.max(selection.top_score * 0.2);

        for sibling in parent.child_elements() {
            if !seen_siblings.insert(sibling.id()) {
                continue;
            }

            let append = if sibling == top_candidate {
                true
            } else {
                let content_bonus = if sibling.attr("class") == top_candidate.attr("class")
                    && sibling.attr("class").is_some()
                {
                    selection.top_score * 0.2
                } else {
                    0.0
                };
                let sibling_score = selection
                    .candidate_scores
                    .get(&sibling.id())
                    .copied()
                    .unwrap_or_default();
                sibling_score + content_bonus >= sibling_threshold
                    || sibling_looks_like_content(sibling)
            };

            if append {
                blocks.extend(extract_structured_blocks(sibling));
            }
        }
    }

    if blocks.is_empty() {
        extract_structured_blocks(top_candidate)
    } else {
        blocks
    }
}

fn readability_content_score(text: &str) -> f64 {
    let length = text.chars().count();
    if length < READABILITY_MIN_SCORE_CHARS {
        return 0.0;
    }

    let comma_count = text.matches(',').count() + text.matches('，').count();
    1.0 + comma_count as f64 + ((length / 100).min(3) as f64)
}

fn readability_ancestor_divider(level: usize) -> f64 {
    match level {
        0 => 1.0,
        1 => 2.0,
        _ => (level as f64) * 3.0,
    }
}

fn readability_initialize_score(element: ElementRef<'_>) -> f64 {
    let base = match element.value().name() {
        "div" => 5.0,
        "pre" | "td" | "blockquote" => 3.0,
        "address" | "ol" | "ul" | "dl" | "dd" | "dt" | "li" | "form" => -3.0,
        "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "th" => -5.0,
        _ => 0.0,
    };

    base + readability_class_weight(element)
}

fn readability_class_weight(element: ElementRef<'_>) -> f64 {
    let value = element.value();
    let mut weight = 0.0;

    for attr in [value.attr("class"), value.id()].into_iter().flatten() {
        let attr = attr.to_ascii_lowercase();
        if contains_any_fragment(&attr, &READABILITY_NEGATIVE_FRAGMENTS) {
            weight -= 25.0;
        }
        if contains_any_fragment(&attr, &READABILITY_POSITIVE_FRAGMENTS) {
            weight += 25.0;
        }
    }

    weight
}

fn is_unlikely_candidate(element: ElementRef<'_>) -> bool {
    if matches!(element.value().name(), "body" | "a") || is_discussion_like_element(element) {
        return false;
    }

    let match_string = build_match_string(element);
    !match_string.is_empty()
        && contains_any_fragment(&match_string, &READABILITY_UNLIKELY_FRAGMENTS)
        && !contains_any_fragment(&match_string, &READABILITY_OK_MAYBE_FRAGMENTS)
        && !has_ancestor_tag(element, "table", 3)
        && !has_ancestor_tag(element, "code", 3)
}

fn sibling_looks_like_content(element: ElementRef<'_>) -> bool {
    if is_inside_ignored_context(element) || is_unlikely_candidate(element) {
        return false;
    }

    if element.value().name() == "p" {
        let text = block_text_from_element(element);
        let text_len = text.chars().count();
        let link_density = get_link_density_readability(element);
        return (text_len > 80 && link_density < 0.25)
            || (text_len > 0 && text_len < 80 && link_density == 0.0 && text.contains(". "));
    }

    let blocks = extract_blocks(element);
    let total_chars = blocks
        .iter()
        .map(|block| block.chars().count())
        .sum::<usize>();
    total_chars >= 140 && get_link_density_readability(element) < 0.35
}

fn build_match_string(element: ElementRef<'_>) -> String {
    let value = element.value();
    [value.id(), value.attr("class")]
        .into_iter()
        .flatten()
        .map(|attr| attr.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join(" ")
}

fn contains_any_fragment(text: &str, fragments: &[&str]) -> bool {
    fragments.iter().any(|fragment| text.contains(fragment))
}

fn has_ancestor_tag(element: ElementRef<'_>, tag: &str, max_depth: usize) -> bool {
    element
        .ancestors()
        .filter_map(ElementRef::wrap)
        .skip(1)
        .take(max_depth)
        .any(|ancestor| ancestor.value().name() == tag)
}

fn score_candidates<'a>(candidates: Vec<ElementRef<'a>>) -> Option<(f64, ElementRef<'a>)> {
    candidates
        .into_iter()
        .filter_map(|candidate| {
            if is_inside_ignored_context(candidate) {
                return None;
            }

            let blocks = extract_blocks(candidate);
            if blocks.is_empty() {
                return None;
            }

            let text_len: usize = blocks.iter().map(|block| block.chars().count()).sum();
            if text_len < 180 {
                return None;
            }

            let paragraph_count = blocks.len() as f64;
            let punctuation_count = blocks
                .iter()
                .flat_map(|block| block.chars())
                .filter(|ch| SENTENCE_SPLITTERS.contains(ch))
                .count() as f64;
            let link_density = link_density(candidate);
            let semantic_bonus = semantic_bonus(candidate);
            let heading_bonus = heading_count(candidate) as f64 * 24.0;
            let score = text_len as f64
                + paragraph_count * 80.0
                + punctuation_count * 10.0
                + semantic_bonus
                + heading_bonus
                - (link_density * text_len as f64 * 0.8);

            Some((score, candidate))
        })
        .max_by(|left, right| left.0.total_cmp(&right.0))
}

fn semantic_bonus(element: ElementRef<'_>) -> f64 {
    let value = element.value();
    let tag_bonus = match value.name() {
        "article" => 240.0,
        "main" => 180.0,
        "section" => 40.0,
        _ => 0.0,
    };

    let attrs = [value.id(), value.attr("class")];
    let attr_bonus = attrs
        .into_iter()
        .flatten()
        .map(|attr| attr.to_ascii_lowercase())
        .map(|attr| {
            let positive = ["article", "content", "entry", "post", "story", "main"]
                .iter()
                .filter(|term| attr.contains(**term))
                .count() as f64
                * 35.0;
            let negative = [
                "nav", "menu", "footer", "sidebar", "comment", "share", "related",
            ]
            .iter()
            .filter(|term| attr.contains(**term))
            .count() as f64
                * 80.0;
            positive - negative
        })
        .sum::<f64>();

    tag_bonus + attr_bonus
}

fn heading_count(element: ElementRef<'_>) -> usize {
    let selector = Selector::parse("h1, h2, h3").expect("valid selector");
    element
        .select(&selector)
        .filter(|child| !is_inside_ignored_context(*child))
        .count()
}

fn link_density(element: ElementRef<'_>) -> f64 {
    get_link_density_readability(element)
}

fn get_link_density_readability(element: ElementRef<'_>) -> f64 {
    let all_text = text_from_element(element);
    let total_len = all_text.chars().count();
    if total_len == 0 {
        return 0.0;
    }

    let selector = Selector::parse("a").expect("valid selector");
    let link_len = element
        .select(&selector)
        .map(text_from_element)
        .map(|text| text.chars().count())
        .sum::<usize>();

    link_len as f64 / total_len as f64
}

fn extract_blocks(element: ElementRef<'_>) -> Vec<String> {
    let discussion_blocks = extract_discussion_text_blocks(element);
    if discussion_blocks.len() >= 2 {
        return discussion_blocks;
    }

    let selector = Selector::parse("h1, h2, h3, h4, p, li, blockquote, pre, table, td, div")
        .expect("valid selector");

    let blocks = element
        .select(&selector)
        .filter(|child| !is_inside_ignored_context(*child))
        .filter(|child| should_extract_block(*child))
        .map(block_text_from_element)
        .filter(|text| text.chars().count() >= MIN_BLOCK_CHARS)
        .collect::<Vec<_>>();

    if !blocks.is_empty() {
        return blocks;
    }

    let own_text = text_from_element(element);
    if own_text.chars().count() >= 180 {
        return vec![own_text];
    }

    Vec::new()
}

fn extract_structured_blocks(element: ElementRef<'_>) -> Vec<ArticleBlock> {
    let discussion_blocks = extract_discussion_structured_blocks(element);
    if discussion_blocks.len() >= 2 {
        return discussion_blocks;
    }

    let selector = Selector::parse("h1, h2, h3, h4, p, li, blockquote, pre, table, td, div")
        .expect("valid selector");
    let mut blocks = Vec::new();
    let mut seen = HashSet::new();
    let mut heading_stack: Vec<(u8, String)> = Vec::new();
    let mut position = 0usize;

    for child in element.select(&selector) {
        if is_inside_ignored_context(child) {
            continue;
        }
        if !should_extract_block(child) {
            continue;
        }

        let text = block_text_from_element(child);
        if text.is_empty() || is_probable_boilerplate(&text) {
            continue;
        }

        let kind = block_kind_from_tag(child.value().name());
        let min_chars = match kind {
            BlockKind::Heading => MIN_HEADING_CHARS,
            BlockKind::ListItem => MIN_LIST_ITEM_CHARS,
            BlockKind::Code => MIN_CODE_BLOCK_CHARS,
            BlockKind::Table => MIN_TABLE_BLOCK_CHARS,
            _ => MIN_BLOCK_CHARS,
        };

        if text.chars().count() < min_chars || !seen.insert(text.clone()) {
            continue;
        }

        if !matches!(kind, BlockKind::Heading) && link_density(child) > 0.55 {
            continue;
        }

        let heading_level = heading_level(child.value().name());
        let heading_path = if let Some(level) = heading_level {
            while heading_stack
                .last()
                .map(|(current_level, _)| *current_level >= level)
                .unwrap_or(false)
            {
                heading_stack.pop();
            }
            heading_stack.push((level, text.clone()));
            heading_stack
                .iter()
                .map(|(_, title)| title.clone())
                .collect()
        } else {
            heading_stack
                .iter()
                .map(|(_, title)| title.clone())
                .collect()
        };

        blocks.push(ArticleBlock {
            id: format!("block-{}", position + 1),
            kind,
            text: text.clone(),
            heading_path,
            heading_level,
            char_count: text.chars().count(),
            estimated_tokens: estimate_tokens(&text),
            position,
        });
        position += 1;
    }

    if !blocks.is_empty() {
        return blocks;
    }

    let own_text = text_from_element(element);
    if own_text.chars().count() < 180 {
        return Vec::new();
    }

    vec![ArticleBlock {
        id: "block-1".to_string(),
        kind: BlockKind::Paragraph,
        text: own_text.clone(),
        heading_path: Vec::new(),
        heading_level: None,
        char_count: own_text.chars().count(),
        estimated_tokens: estimate_tokens(&own_text),
        position: 0,
    }]
}

fn extract_discussion_blocks(document: &Html) -> Vec<ArticleBlock> {
    let selector = Selector::parse(
        ".commtext, .comment-text, .comment-body, .comment-content, .message-content, \
         .post-message, [itemprop='commentText'], [data-role='comment-body']",
    )
    .expect("valid selector");
    let mut blocks = Vec::new();
    let mut seen = HashSet::new();
    let mut position = 0usize;

    for child in document.select(&selector) {
        if is_inside_ignored_context(child) {
            continue;
        }

        let text = text_from_element(child);
        if text.is_empty() || is_probable_boilerplate(&text) || !seen.insert(text.clone()) {
            continue;
        }
        if text.chars().count() < MIN_LIST_ITEM_CHARS {
            continue;
        }

        blocks.push(ArticleBlock {
            id: format!("block-{}", position + 1),
            kind: BlockKind::Paragraph,
            text: text.clone(),
            heading_path: Vec::new(),
            heading_level: None,
            char_count: text.chars().count(),
            estimated_tokens: estimate_tokens(&text),
            position,
        });
        position += 1;
    }

    blocks
}

fn extract_fallback_blocks(document: &Html) -> Vec<ArticleBlock> {
    let selector =
        Selector::parse("article, main, p, h1, h2, h3, li, blockquote, pre, table, td, div")
            .expect("valid selector");
    let mut blocks = Vec::new();
    let mut heading_stack: Vec<(u8, String)> = Vec::new();
    let mut seen = HashSet::new();
    let mut position = 0usize;

    for child in document.select(&selector) {
        if is_inside_ignored_context(child) {
            continue;
        }
        if !should_extract_block(child) {
            continue;
        }

        let text = block_text_from_element(child);
        if text.is_empty() || is_probable_boilerplate(&text) || !seen.insert(text.clone()) {
            continue;
        }

        let kind = block_kind_from_tag(child.value().name());
        let min_chars = match kind {
            BlockKind::Heading => MIN_HEADING_CHARS,
            BlockKind::ListItem => MIN_LIST_ITEM_CHARS,
            BlockKind::Code => MIN_CODE_BLOCK_CHARS,
            BlockKind::Table => MIN_TABLE_BLOCK_CHARS,
            _ => MIN_BLOCK_CHARS,
        };
        if text.chars().count() < min_chars {
            continue;
        }

        let heading_level = heading_level(child.value().name());
        let heading_path = if let Some(level) = heading_level {
            while heading_stack
                .last()
                .map(|(current_level, _)| *current_level >= level)
                .unwrap_or(false)
            {
                heading_stack.pop();
            }
            heading_stack.push((level, text.clone()));
            heading_stack
                .iter()
                .map(|(_, title)| title.clone())
                .collect()
        } else {
            heading_stack
                .iter()
                .map(|(_, title)| title.clone())
                .collect()
        };

        blocks.push(ArticleBlock {
            id: format!("block-{}", position + 1),
            kind,
            text: text.clone(),
            heading_path,
            heading_level,
            char_count: text.chars().count(),
            estimated_tokens: estimate_tokens(&text),
            position,
        });
        position += 1;
    }

    blocks
}

fn normalize_structured_blocks(blocks: Vec<ArticleBlock>) -> Vec<ArticleBlock> {
    let mut normalized = Vec::new();
    let mut seen = HashSet::new();

    for block in blocks {
        let text = normalize_text(&block.text);
        let min_chars = match block.kind {
            BlockKind::Heading => MIN_HEADING_CHARS,
            BlockKind::ListItem => MIN_LIST_ITEM_CHARS,
            BlockKind::Code => MIN_CODE_BLOCK_CHARS,
            BlockKind::Table => MIN_TABLE_BLOCK_CHARS,
            _ => MIN_BLOCK_CHARS,
        };

        if text.chars().count() < min_chars || !seen.insert(text.clone()) {
            continue;
        }

        let position = normalized.len();
        normalized.push(ArticleBlock {
            id: format!("block-{}", position + 1),
            text: text.clone(),
            char_count: text.chars().count(),
            estimated_tokens: estimate_tokens(&text),
            position,
            ..block
        });
    }

    normalized
}

fn build_outline(blocks: &[ArticleBlock]) -> Vec<OutlineNode> {
    blocks
        .iter()
        .filter_map(|block| {
            block.heading_level.map(|level| OutlineNode {
                title: block.text.clone(),
                level,
                block_id: block.id.clone(),
                position: block.position,
            })
        })
        .collect()
}

fn rank_blocks(
    blocks: &[ArticleBlock],
    title: Option<&str>,
    excerpt: Option<&str>,
    page_type: &PageType,
) -> Vec<RankedBlock> {
    let content_blocks = blocks
        .iter()
        .filter(|block| !matches!(block.kind, BlockKind::Heading))
        .collect::<Vec<_>>();
    let frequencies = build_block_token_frequency(&content_blocks);
    let title_tokens = title.map(tokenize).unwrap_or_default();
    let excerpt_tokens = excerpt.map(tokenize).unwrap_or_default();

    let mut ranked = content_blocks
        .into_iter()
        .filter_map(|block| {
            let tokens = tokenize(&block.text);
            if tokens.is_empty() {
                return None;
            }

            let token_score = tokens
                .iter()
                .map(|token| *frequencies.get(token).unwrap_or(&0.0))
                .sum::<f64>()
                / tokens.len() as f64;
            let title_overlap = overlap_score(&tokens, &title_tokens);
            let excerpt_overlap = overlap_score(&tokens, &excerpt_tokens);
            let position_bonus = 1.8 / (block.position as f64 + 1.0);
            let heading_bonus = if block.heading_path.is_empty() {
                0.0
            } else {
                0.65 + (block.heading_path.len().min(3) as f64 * 0.12)
            };
            let length_bonus = match block.char_count {
                70..=280 => 0.8,
                281..=500 => 0.45,
                _ => 0.0,
            };
            let sentence_count = split_sentences(&block.text).len();
            let sentence_bonus = match sentence_count {
                2..=4 => 0.5,
                5..=6 => 0.25,
                _ => 0.0,
            };
            let number_bonus = if block.text.chars().any(|ch| ch.is_ascii_digit()) {
                0.2
            } else {
                0.0
            };
            let list_penalty = if matches!(block.kind, BlockKind::ListItem) {
                0.35
            } else {
                0.0
            };
            let section_penalty = demo_section_penalty(block, page_type);
            let structure_bonus = match block.kind {
                BlockKind::Code => {
                    if matches!(page_type, PageType::DocsPage) {
                        1.15
                    } else {
                        0.35
                    }
                }
                BlockKind::Table => {
                    if matches!(page_type, PageType::DocsPage | PageType::ProductPage) {
                        1.2
                    } else {
                        0.45
                    }
                }
                _ => 0.0,
            };
            let unique_token_ratio =
                tokens.iter().collect::<HashSet<_>>().len() as f64 / tokens.len() as f64;
            let novelty_bonus = if unique_token_ratio >= 0.72 {
                0.25
            } else {
                0.0
            };

            let score = token_score
                + title_overlap * 2.8
                + excerpt_overlap * 2.1
                + position_bonus
                + heading_bonus
                + length_bonus
                + number_bonus
                + structure_bonus;
            let score = score + sentence_bonus + novelty_bonus - list_penalty - section_penalty;
            let mut reasons = Vec::new();
            if title_overlap > 0.0 {
                reasons.push("title-overlap".to_string());
            }
            if excerpt_overlap > 0.0 {
                reasons.push("excerpt-overlap".to_string());
            }
            if block.position <= 3 {
                reasons.push("early-position".to_string());
            }
            if !block.heading_path.is_empty() {
                reasons.push("section-context".to_string());
            }
            if sentence_bonus > 0.0 {
                reasons.push("multi-sentence-density".to_string());
            }
            if novelty_bonus > 0.0 {
                reasons.push("high-novelty".to_string());
            }
            if matches!(block.kind, BlockKind::ListItem) {
                reasons.push("list-item".to_string());
            }
            if matches!(block.kind, BlockKind::Code) {
                reasons.push("code-block".to_string());
            }
            if matches!(block.kind, BlockKind::Table) {
                reasons.push("table-block".to_string());
            }
            if section_penalty > 0.0 {
                reasons.push("interactive-section".to_string());
            }

            Some(RankedBlock {
                block_id: block.id.clone(),
                score,
                reasons,
            })
        })
        .collect::<Vec<_>>();

    ranked.sort_by(|left, right| right.score.total_cmp(&left.score));
    ranked
}

fn demo_section_penalty(block: &ArticleBlock, page_type: &PageType) -> f64 {
    if !matches!(page_type, PageType::Article | PageType::GenericPage) {
        return 0.0;
    }

    let heading_text = block.heading_path.join(" ").to_ascii_lowercase();
    if heading_text.is_empty() {
        return 0.0;
    }

    let demo_like = [
        "demo",
        "demos",
        "interactive",
        "widget",
        "playground",
        "simulator",
        "showcase",
        "try it",
        "tutor mode",
        "webpage creation",
    ]
    .iter()
    .any(|fragment| heading_text.contains(fragment));

    if !demo_like {
        return 0.0;
    }

    match block.kind {
        BlockKind::ListItem => 10.0,
        BlockKind::Paragraph => 7.5,
        BlockKind::Code | BlockKind::Table => 5.0,
        BlockKind::Heading => 3.0,
        BlockKind::Quote => 6.0,
    }
}

fn build_prompt_payload(
    article: &ArticleMetadata,
    cleaned_text: &str,
    summary: &str,
    blocks: &[ArticleBlock],
    ranked_blocks: &[RankedBlock],
    quality: &QualityReport,
    max_prompt_chars: usize,
    max_prompt_tokens: usize,
) -> PromptPayload {
    let article_header = build_article_header(article);
    let key_points = split_sentences(summary)
        .into_iter()
        .take(3)
        .collect::<Vec<_>>();
    let block_lookup = blocks
        .iter()
        .map(|block| (block.id.as_str(), block))
        .collect::<HashMap<_, _>>();
    let prompt_selection = if matches!(quality.page_type, PageType::DiscussionThread) {
        select_discussion_prompt_blocks(
            blocks,
            ranked_blocks,
            &block_lookup,
            estimate_tokens(&article_header),
            max_prompt_chars,
            max_prompt_tokens,
        )
    } else {
        select_ranked_prompt_blocks(
            blocks,
            ranked_blocks,
            &block_lookup,
            &quality.page_type,
            estimate_tokens(&article_header),
            max_prompt_chars,
            max_prompt_tokens,
        )
    };
    let compressed_sections = prompt_selection.supporting_blocks.clone();
    let supporting_blocks = prompt_selection.supporting_blocks;

    let compressed_context = if compressed_sections.is_empty() {
        truncate_chars(cleaned_text, max_prompt_chars)
    } else {
        compressed_sections.join("\n\n")
    };
    let quality_note = format_quality_note(quality);
    let compressed_context = if quality_note.is_empty() {
        compressed_context
    } else {
        format!("{quality_note}\n\n{compressed_context}")
    };
    let token_budget_used = estimate_tokens(&article_header) + estimate_tokens(&compressed_context);
    let selection_strategy = if supporting_blocks.is_empty() {
        "fallback-truncate".to_string()
    } else {
        prompt_selection.selection_strategy
    };

    PromptPayload {
        article_header,
        compressed_context,
        key_points,
        supporting_blocks,
        token_budget_used,
        token_budget_target: max_prompt_tokens,
        selection_strategy,
    }
}

fn select_ranked_prompt_blocks(
    blocks: &[ArticleBlock],
    ranked_blocks: &[RankedBlock],
    block_lookup: &HashMap<&str, &ArticleBlock>,
    page_type: &PageType,
    initial_tokens: usize,
    max_prompt_chars: usize,
    max_prompt_tokens: usize,
) -> PromptSelection {
    let mut supporting_blocks = Vec::new();
    let mut used_chars = 0usize;
    let mut used_tokens = initial_tokens;
    let mut used_sections = HashSet::new();
    let reserve_lead_blocks = matches!(page_type, PageType::Article | PageType::GenericPage);
    let mut lead_blocks_added = 0usize;
    let early_position_limit = if reserve_lead_blocks {
        Some((blocks.len() / 3).max(24))
    } else {
        None
    };
    let mut ranked_candidates = Vec::new();
    let mut seen_ranked_ids = HashSet::new();

    if reserve_lead_blocks {
        for block in blocks
            .iter()
            .filter(|block| !matches!(block.kind, BlockKind::Heading))
            .take(3)
        {
            let section_key = block
                .heading_path
                .last()
                .cloned()
                .unwrap_or_else(|| format!("__lead-{}", block.position));
            let is_new_section = used_sections.insert(section_key.clone());
            if push_prompt_block(
                &mut supporting_blocks,
                &mut used_chars,
                &mut used_tokens,
                block,
                max_prompt_chars,
                max_prompt_tokens,
            ) {
                lead_blocks_added += 1;
            } else if is_new_section {
                used_sections.remove(&section_key);
            }
        }
    }

    if let Some(limit) = early_position_limit {
        for ranked in ranked_blocks
            .iter()
            .take(MAX_SUPPORTING_BLOCKS.saturating_mul(8))
        {
            let Some(block) = block_lookup.get(ranked.block_id.as_str()) else {
                continue;
            };
            if block.position <= limit && seen_ranked_ids.insert(ranked.block_id.as_str()) {
                ranked_candidates.push(ranked);
            }
        }
    }

    for ranked in ranked_blocks
        .iter()
        .take(MAX_SUPPORTING_BLOCKS.saturating_mul(8))
    {
        if seen_ranked_ids.insert(ranked.block_id.as_str()) {
            ranked_candidates.push(ranked);
        }
    }

    for ranked in ranked_candidates {
        let Some(block) = block_lookup.get(ranked.block_id.as_str()) else {
            continue;
        };

        let section_key = block
            .heading_path
            .last()
            .cloned()
            .unwrap_or_else(|| format!("__lead-{}", block.position));
        let is_new_section = used_sections.insert(section_key.clone());
        let max_blocks = if is_new_section {
            MAX_SUPPORTING_BLOCKS
        } else {
            MAX_SUPPORTING_BLOCKS.saturating_sub(1)
        };
        if supporting_blocks.len() >= max_blocks && !is_new_section {
            continue;
        }

        if !push_prompt_block(
            &mut supporting_blocks,
            &mut used_chars,
            &mut used_tokens,
            block,
            max_prompt_chars,
            max_prompt_tokens,
        ) && is_new_section
        {
            used_sections.remove(&section_key);
        }

        if supporting_blocks.len() >= MAX_SUPPORTING_BLOCKS {
            break;
        }
    }

    let selection_strategy = if supporting_blocks.is_empty() {
        "fallback-truncate".to_string()
    } else if lead_blocks_added > 0 && used_sections.len() > 1 {
        "ranked-blocks-lead-plus-diverse-sections".to_string()
    } else if lead_blocks_added > 0 {
        "ranked-blocks-lead-plus-rank".to_string()
    } else if used_sections.len() > 1 {
        "ranked-blocks-diverse-sections".to_string()
    } else {
        "ranked-blocks".to_string()
    };

    PromptSelection {
        supporting_blocks,
        selection_strategy,
    }
}

fn select_discussion_prompt_blocks(
    blocks: &[ArticleBlock],
    ranked_blocks: &[RankedBlock],
    block_lookup: &HashMap<&str, &ArticleBlock>,
    initial_tokens: usize,
    max_prompt_chars: usize,
    max_prompt_tokens: usize,
) -> PromptSelection {
    let content_blocks = blocks
        .iter()
        .filter(|block| !matches!(block.kind, BlockKind::Heading))
        .collect::<Vec<_>>();
    let mut supporting_blocks = Vec::new();
    let mut used_chars = 0usize;
    let mut used_tokens = initial_tokens;
    let mut selected_ids = HashSet::new();
    let mut candidate_ids = Vec::new();

    for block in content_blocks.iter().take(3) {
        if selected_ids.insert(block.id.clone()) {
            candidate_ids.push(block.id.clone());
        }
    }

    if !content_blocks.is_empty() {
        let rank_positions = ranked_blocks
            .iter()
            .enumerate()
            .map(|(index, ranked)| (ranked.block_id.as_str(), index))
            .collect::<HashMap<_, _>>();
        let window_count = content_blocks.len().min(DISCUSSION_WINDOW_COUNT);

        for window_index in 0..window_count {
            let start = window_index * content_blocks.len() / window_count;
            let end = ((window_index + 1) * content_blocks.len() / window_count).max(start + 1);
            let end = end.min(content_blocks.len());
            let best_in_window = content_blocks[start..end]
                .iter()
                .filter(|block| !selected_ids.contains(block.id.as_str()))
                .min_by(|left, right| {
                    let left_rank = rank_positions
                        .get(left.id.as_str())
                        .copied()
                        .unwrap_or(usize::MAX);
                    let right_rank = rank_positions
                        .get(right.id.as_str())
                        .copied()
                        .unwrap_or(usize::MAX);
                    left_rank
                        .cmp(&right_rank)
                        .then_with(|| right.char_count.cmp(&left.char_count))
                });

            if let Some(block) = best_in_window {
                if selected_ids.insert(block.id.clone()) {
                    candidate_ids.push(block.id.clone());
                }
            }
        }
    }

    for ranked in ranked_blocks.iter() {
        if candidate_ids.len() >= MAX_DISCUSSION_SUPPORTING_BLOCKS_HARD_CAP {
            break;
        }

        if selected_ids.insert(ranked.block_id.clone()) {
            candidate_ids.push(ranked.block_id.clone());
        }
    }

    for block_id in candidate_ids {
        let Some(block) = block_lookup.get(block_id.as_str()) else {
            continue;
        };

        if !push_prompt_block(
            &mut supporting_blocks,
            &mut used_chars,
            &mut used_tokens,
            block,
            max_prompt_chars,
            max_prompt_tokens,
        ) {
            continue;
        }

        if supporting_blocks.len() >= MAX_DISCUSSION_SUPPORTING_BLOCKS_HARD_CAP {
            break;
        }
    }

    PromptSelection {
        supporting_blocks,
        selection_strategy: "discussion-ranked-blocks-breadth-first".to_string(),
    }
}

fn push_prompt_block(
    supporting_blocks: &mut Vec<String>,
    used_chars: &mut usize,
    used_tokens: &mut usize,
    block: &ArticleBlock,
    max_prompt_chars: usize,
    max_prompt_tokens: usize,
) -> bool {
    let block_text = format_block_for_prompt(block);
    if supporting_blocks.contains(&block_text) {
        return false;
    }

    let block_tokens = estimate_tokens(&block_text);
    let addition = if supporting_blocks.is_empty() {
        block_text.chars().count()
    } else {
        block_text.chars().count() + 2
    };

    if *used_chars + addition > max_prompt_chars || *used_tokens + block_tokens > max_prompt_tokens
    {
        return false;
    }

    *used_chars += addition;
    *used_tokens += block_tokens;
    supporting_blocks.push(block_text);
    true
}

fn build_article_header(article: &ArticleMetadata) -> String {
    let mut lines = Vec::new();

    if let Some(title) = article.title.as_deref() {
        lines.push(format!("Title: {title}"));
    }
    if let Some(url) = article.canonical_url.as_deref().or(article.url.as_deref()) {
        lines.push(format!("URL: {url}"));
    }
    if let Some(excerpt) = article.excerpt.as_deref() {
        lines.push(format!("Excerpt: {excerpt}"));
    }
    if let Some(byline) = article.byline.as_deref() {
        lines.push(format!("Byline: {byline}"));
    }
    if let Some(published_time) = article.published_time.as_deref() {
        lines.push(format!("Published: {published_time}"));
    }
    if let Some(language) = article.language.as_deref() {
        lines.push(format!("Language: {language}"));
    }
    lines.push(format!("Extraction source: {}", article.source));

    lines.join("\n")
}

fn format_quality_note(quality: &QualityReport) -> String {
    let mut lines = Vec::new();
    lines.push(format!(
        "Extraction quality: {:?} page, confidence {:.2}, safe_to_summarize={}",
        quality.page_type, quality.confidence, quality.safe_to_summarize
    ));

    if !quality.warnings.is_empty() {
        lines.push(format!("Warnings: {}", quality.warnings.join(" | ")));
    }

    lines.join("\n")
}

fn assess_quality(
    blocks: &[ArticleBlock],
    cleaned_text: &str,
    source: &str,
    title: Option<&str>,
    url: Option<&str>,
) -> QualityReport {
    let mut warnings = Vec::new();
    let cleaned_chars = cleaned_text.chars().count();
    let content_blocks = blocks
        .iter()
        .filter(|block| !matches!(block.kind, BlockKind::Heading))
        .count();
    let total_content_chars = blocks
        .iter()
        .filter(|block| !matches!(block.kind, BlockKind::Heading))
        .map(|block| block.char_count)
        .sum::<usize>();
    let heading_count = blocks
        .iter()
        .filter(|block| matches!(block.kind, BlockKind::Heading))
        .count();
    let list_item_count = blocks
        .iter()
        .filter(|block| matches!(block.kind, BlockKind::ListItem))
        .count();
    let short_content_blocks = blocks
        .iter()
        .filter(|block| !matches!(block.kind, BlockKind::Heading) && block.char_count < 65)
        .count();
    let avg_content_block_chars = if content_blocks == 0 {
        0.0
    } else {
        total_content_chars as f64 / content_blocks as f64
    };
    let short_block_ratio = if content_blocks == 0 {
        0.0
    } else {
        short_content_blocks as f64 / content_blocks as f64
    };
    let list_ratio = if content_blocks == 0 {
        0.0
    } else {
        list_item_count as f64 / content_blocks as f64
    };
    let numeric_block_ratio = if content_blocks == 0 {
        0.0
    } else {
        blocks
            .iter()
            .filter(|block| {
                !matches!(block.kind, BlockKind::Heading)
                    && block.text.chars().filter(|ch| ch.is_ascii_digit()).count() >= 3
            })
            .count() as f64
            / content_blocks as f64
    };
    let unique_sections = blocks
        .iter()
        .filter_map(|block| block.heading_path.last().cloned())
        .collect::<HashSet<_>>()
        .len();
    let question_like_blocks = blocks
        .iter()
        .filter(|block| {
            !matches!(block.kind, BlockKind::Heading)
                && (block.text.contains('?')
                    || block.text.contains('？')
                    || block.text.to_ascii_lowercase().starts_with("q:")
                    || block.text.to_ascii_lowercase().starts_with("a:"))
        })
        .count();
    let code_like_blocks = blocks
        .iter()
        .filter(|block| {
            matches!(block.kind, BlockKind::Code)
                || block.text.contains("fn ")
                || block.text.contains("const ")
                || block.text.contains("import ")
                || block.text.contains("```")
                || block.text.contains("bash ")
        })
        .count();
    let table_like_blocks = blocks
        .iter()
        .filter(|block| matches!(block.kind, BlockKind::Table))
        .count();
    let lower_title = title.unwrap_or_default().to_ascii_lowercase();
    let lower_url = url.unwrap_or_default().to_ascii_lowercase();
    let search_signal = lower_url.contains("/search")
        || lower_url.contains("?q=")
        || lower_url.contains("&q=")
        || lower_title.contains("search")
        || lower_title.contains("results");
    let listing_signal = lower_url.contains("/tag/")
        || lower_url.contains("/category/")
        || lower_url.contains("/archive")
        || lower_title.contains("latest")
        || lower_title.contains("top stories")
        || lower_title.contains("all posts");
    let product_signal = lower_url.contains("/product")
        || lower_url.contains("/shop")
        || lower_url.contains("/pricing")
        || lower_title.contains("buy")
        || lower_title.contains("price")
        || lower_title.contains("pricing");
    let discussion_signal = lower_url.contains("/forum")
        || lower_url.contains("/discussion")
        || lower_url.contains("/thread")
        || lower_url.contains("news.ycombinator.com/item?id=")
        || lower_title.contains("forum")
        || lower_title.contains("discussion")
        || lower_title.contains("thread")
        || (lower_title.contains("hacker news") && lower_url.contains("/item?"));
    let docs_signal = lower_url.contains("/docs")
        || lower_url.contains("/guide")
        || lower_url.contains("/reference")
        || lower_title.contains("documentation")
        || lower_title.contains("guide")
        || lower_title.contains("reference")
        || lower_title.contains("getting started");
    let paywall_signal = lower_url.contains("/subscribe")
        || lower_url.contains("/paywall")
        || lower_title.contains("subscribe to continue")
        || lower_title.contains("subscription required")
        || lower_title.contains("subscriber only")
        || cleaned_text
            .to_ascii_lowercase()
            .contains("subscribe to continue reading")
        || cleaned_text
            .to_ascii_lowercase()
            .contains("subscriber-only content");

    if cleaned_chars < 220 {
        warnings.push("Extracted article text is short.".to_string());
    }
    if content_blocks < 2 {
        warnings.push("Only a small number of content blocks were extracted.".to_string());
    }
    if avg_content_block_chars < 55.0 {
        warnings.push("Block density is low and may indicate a non-article page.".to_string());
    }
    if list_ratio >= 0.55 {
        warnings.push("This page is dominated by list-style blocks.".to_string());
    }
    if short_block_ratio >= 0.6 {
        warnings.push("Many extracted blocks are very short.".to_string());
    }

    let (page_type, mut confidence): (PageType, f64) = if source == "selection" {
        (PageType::Selection, 0.98)
    } else if paywall_signal && (cleaned_chars < 320 || content_blocks < 3) {
        (PageType::PaywalledPage, 0.78)
    } else if search_signal && (list_ratio >= 0.35 || short_block_ratio >= 0.45) {
        (PageType::SearchResults, 0.84)
    } else if docs_signal && (heading_count >= 1 || code_like_blocks >= 1 || table_like_blocks >= 1)
    {
        (PageType::DocsPage, 0.82)
    } else if product_signal && numeric_block_ratio >= 0.25 {
        (PageType::ProductPage, 0.74)
    } else if discussion_signal
        && (question_like_blocks >= 1
            || short_block_ratio >= 0.35
            || (content_blocks >= 3 && heading_count == 0))
    {
        (PageType::DiscussionThread, 0.76)
    } else if listing_signal || (list_ratio >= 0.55 && heading_count == 0) {
        (PageType::ListingPage, 0.72)
    } else if cleaned_chars < 180 {
        (PageType::SparsePage, 0.32)
    } else if content_blocks >= 3 && avg_content_block_chars >= 70.0 {
        (PageType::Article, 0.84)
    } else {
        (PageType::GenericPage, 0.58)
    };

    if heading_count > 0 {
        confidence += 0.08;
    }
    if unique_sections >= 2 {
        confidence += 0.05;
    }
    if !warnings.is_empty() {
        confidence -= 0.08;
    }
    if matches!(page_type, PageType::SearchResults | PageType::ListingPage) {
        warnings.push(
            "This page looks more like a navigation or discovery surface than a single article."
                .to_string(),
        );
    }
    if matches!(page_type, PageType::ProductPage) {
        warnings.push("This page looks like a product or pricing page, so summary quality may be less article-like.".to_string());
    }
    if matches!(page_type, PageType::DocsPage) {
        warnings.push("This page looks like documentation, so the best summary may focus on steps, APIs, and reference details.".to_string());
    }
    if matches!(page_type, PageType::DiscussionThread) {
        warnings.push("This page looks like a discussion thread, so the extracted content may mix multiple speakers and viewpoints.".to_string());
    }
    if matches!(page_type, PageType::PaywalledPage) {
        warnings.push("This page looks paywalled or subscriber-only, so the extracted text may be incomplete.".to_string());
    }

    QualityReport {
        page_type: page_type.clone(),
        confidence: confidence.clamp(0.0, 0.99),
        safe_to_summarize: matches!(
            page_type,
            PageType::Article | PageType::Selection | PageType::DocsPage
        ) || (matches!(page_type, PageType::GenericPage)
            && cleaned_chars >= 260),
        warnings,
    }
}

fn block_kind_from_tag(tag: &str) -> BlockKind {
    match tag {
        "h1" | "h2" | "h3" | "h4" => BlockKind::Heading,
        "li" => BlockKind::ListItem,
        "blockquote" => BlockKind::Quote,
        "pre" => BlockKind::Code,
        "table" => BlockKind::Table,
        _ => BlockKind::Paragraph,
    }
}

fn heading_level(tag: &str) -> Option<u8> {
    match tag {
        "h1" => Some(1),
        "h2" => Some(2),
        "h3" => Some(3),
        "h4" => Some(4),
        _ => None,
    }
}

fn format_block_for_prompt(block: &ArticleBlock) -> String {
    let path = if block.heading_path.is_empty() {
        String::new()
    } else {
        format!("[{}]\n", block.heading_path.join(" > "))
    };
    let prefix = match block.kind {
        BlockKind::Code => "[Code]\n",
        BlockKind::Table => "[Table]\n",
        _ => "",
    };

    format!("{path}{prefix}{}", block.text)
}

fn is_inside_ignored_context(element: ElementRef<'_>) -> bool {
    element
        .ancestors()
        .filter_map(ElementRef::wrap)
        .any(is_ignored_context_element)
}

fn is_discussion_like_element(element: ElementRef<'_>) -> bool {
    let value = element.value();
    let has_discussion_attr = [value.id(), value.attr("class")]
        .into_iter()
        .flatten()
        .map(|attr| attr.to_ascii_lowercase())
        .any(|attr| {
            [
                "comment",
                "commtext",
                "thread",
                "discussion",
                "reply",
                "replies",
            ]
            .iter()
            .any(|term| attr.contains(term))
        });

    has_discussion_attr || extract_discussion_text_blocks(element).len() >= 2
}

fn extract_discussion_text_blocks(element: ElementRef<'_>) -> Vec<String> {
    let selector = Selector::parse(
        ".commtext, .comment-text, .comment-body, .comment-content, .message-content, \
         .post-message, [itemprop='commentText'], [data-role='comment-body']",
    )
    .expect("valid selector");

    element
        .select(&selector)
        .filter(|child| !is_inside_ignored_context(*child))
        .map(text_from_element)
        .filter(|text| !is_probable_boilerplate(text))
        .filter(|text| text.chars().count() >= MIN_LIST_ITEM_CHARS)
        .collect()
}

fn extract_discussion_structured_blocks(element: ElementRef<'_>) -> Vec<ArticleBlock> {
    let selector = Selector::parse(
        ".commtext, .comment-text, .comment-body, .comment-content, .message-content, \
         .post-message, [itemprop='commentText'], [data-role='comment-body']",
    )
    .expect("valid selector");
    let mut blocks = Vec::new();
    let mut seen = HashSet::new();
    let mut position = 0usize;

    for child in element.select(&selector) {
        if is_inside_ignored_context(child) {
            continue;
        }

        let text = text_from_element(child);
        if text.is_empty() || is_probable_boilerplate(&text) || !seen.insert(text.clone()) {
            continue;
        }
        if text.chars().count() < MIN_LIST_ITEM_CHARS {
            continue;
        }

        blocks.push(ArticleBlock {
            id: format!("block-{}", position + 1),
            kind: BlockKind::Paragraph,
            text: text.clone(),
            heading_path: Vec::new(),
            heading_level: None,
            char_count: text.chars().count(),
            estimated_tokens: estimate_tokens(&text),
            position,
        });
        position += 1;
    }

    blocks
}

fn text_from_element(element: ElementRef<'_>) -> String {
    let mut parts = Vec::new();

    for node in element.descendants() {
        let Some(text) = node.value().as_text() else {
            continue;
        };
        if is_node_inside_ignored_context(node) {
            continue;
        }
        parts.push(text.to_string());
    }

    normalize_text(&parts.join(" "))
}

fn is_node_inside_ignored_context(node: ego_tree::NodeRef<'_, Node>) -> bool {
    std::iter::successors(node.parent(), |current| current.parent())
        .filter_map(ElementRef::wrap)
        .any(is_ignored_context_element)
}

fn is_ignored_context_element(element: ElementRef<'_>) -> bool {
    let value = element.value();
    if IGNORED_TAGS.contains(&value.name()) {
        if value.name() == "template" {
            let is_astro_template = value.attr("data-astro-template").is_some();
            let is_shadow_template =
                value.attr("shadowrootmode").is_some() || value.attr("shadowroot").is_some();
            if !is_astro_template || is_shadow_template {
                return true;
            }
        } else {
            return true;
        }
    }

    [value.id(), value.attr("class")]
        .into_iter()
        .flatten()
        .map(|attr| attr.to_ascii_lowercase())
        .any(|attr| {
            ["nav", "menu", "footer", "share", "related", "ads"]
                .iter()
                .any(|term| attr.contains(term))
        })
}

fn block_text_from_element(element: ElementRef<'_>) -> String {
    match element.value().name() {
        "pre" => code_text_from_element(element),
        "table" => table_text_from_element(element),
        _ => text_from_element(element),
    }
}

fn should_extract_block(element: ElementRef<'_>) -> bool {
    if is_conditionally_removable(element) {
        return false;
    }

    match element.value().name() {
        "div" => is_div_to_p_candidate(element),
        "li" => find_ancestor_by_tag(element, &["ul", "ol"])
            .map(|list| !is_conditionally_removable(list))
            .unwrap_or(true),
        "td" => find_ancestor_by_tag(element, &["table"])
            .map(|table| !is_conditionally_removable(table))
            .unwrap_or(true),
        _ => true,
    }
}

fn is_div_to_p_candidate(element: ElementRef<'_>) -> bool {
    if element.value().name() != "div" {
        return false;
    }

    !has_child_block_element(element) && get_link_density_readability(element) < 0.5
}

fn has_child_block_element(element: ElementRef<'_>) -> bool {
    element.child_elements().any(|child| {
        matches!(
            child.value().name(),
            "article"
                | "aside"
                | "blockquote"
                | "div"
                | "dl"
                | "fieldset"
                | "figure"
                | "footer"
                | "form"
                | "h1"
                | "h2"
                | "h3"
                | "h4"
                | "h5"
                | "h6"
                | "header"
                | "hr"
                | "li"
                | "main"
                | "nav"
                | "ol"
                | "p"
                | "pre"
                | "section"
                | "table"
                | "td"
                | "ul"
        )
    })
}

fn is_conditionally_removable(element: ElementRef<'_>) -> bool {
    match element.value().name() {
        "div" | "ul" | "ol" | "table" => should_remove_container(element),
        _ => false,
    }
}

fn should_remove_container(element: ElementRef<'_>) -> bool {
    let tag = element.value().name();
    if tag == "div"
        && is_div_to_p_candidate(element)
        && text_from_element(element).chars().count() >= MIN_BLOCK_CHARS
    {
        return false;
    }
    if tag == "table" && is_probably_data_table(element) {
        return false;
    }
    if has_ancestor_tag(element, "code", 3) {
        return false;
    }

    let weight = readability_class_weight(element);
    if weight < 0.0 {
        return true;
    }

    let text = text_from_element(element);
    let content_length = text.chars().count();
    if content_length == 0 {
        return true;
    }

    let is_list = matches!(tag, "ul" | "ol");
    let paragraph_count = count_descendants(element, "p");
    let image_count = count_descendants(element, "img");
    let input_count = count_descendants_any(element, &["input", "textarea", "select", "button"]);
    let list_item_count = count_descendants(element, "li");
    let heading_density = text_density(element, &["h1", "h2", "h3", "h4", "h5", "h6"]);
    let textish_density = text_density(
        element,
        &[
            "span",
            "li",
            "td",
            "p",
            "blockquote",
            "pre",
            "code",
            "em",
            "strong",
        ],
    );
    let link_density = get_link_density_readability(element);
    let comma_count = text.matches(',').count() + text.matches('，').count();

    if is_share_like_block(element) && content_length < 500 {
        return true;
    }
    if is_list && list_looks_navigation_like(element) {
        return true;
    }
    if tag == "table" && !is_probably_data_table(element) && link_density > 0.35 {
        return true;
    }

    if comma_count >= 10 {
        return false;
    }

    if !is_list && image_count > 1 && paragraph_count == 0 {
        return true;
    }
    if !is_list && list_item_count > paragraph_count.saturating_add(6) && content_length < 900 {
        return true;
    }
    if input_count > paragraph_count.max(1) / 3 && input_count > 1 {
        return true;
    }
    if !is_list
        && heading_density < 0.9
        && content_length < 80
        && (image_count == 0 || image_count > 2)
        && link_density > 0.0
    {
        return true;
    }
    if weight < 25.0 && link_density > 0.2 {
        return true;
    }
    if weight >= 25.0 && link_density > 0.5 {
        return true;
    }
    if image_count == 0 && textish_density == 0.0 {
        return true;
    }

    false
}

fn find_ancestor_by_tag<'a>(element: ElementRef<'a>, tags: &[&str]) -> Option<ElementRef<'a>> {
    element
        .ancestors()
        .filter_map(ElementRef::wrap)
        .skip(1)
        .find(|ancestor| tags.contains(&ancestor.value().name()))
}

fn count_descendants(element: ElementRef<'_>, tag: &str) -> usize {
    let selector = Selector::parse(tag).expect("valid selector");
    element.select(&selector).count()
}

fn count_descendants_any(element: ElementRef<'_>, tags: &[&str]) -> usize {
    let selector = Selector::parse(&tags.join(", ")).expect("valid selector");
    element.select(&selector).count()
}

fn text_density(element: ElementRef<'_>, tags: &[&str]) -> f64 {
    let total_text = text_from_element(element).chars().count();
    if total_text == 0 {
        return 0.0;
    }

    let selector = Selector::parse(&tags.join(", ")).expect("valid selector");
    let child_text = element
        .select(&selector)
        .map(text_from_element)
        .map(|text| text.chars().count())
        .sum::<usize>();

    child_text as f64 / total_text as f64
}

fn is_share_like_block(element: ElementRef<'_>) -> bool {
    let match_string = build_match_string(element);
    contains_any_fragment(
        &match_string,
        &[
            "share",
            "sharedaddy",
            "related",
            "nav",
            "menu",
            "footer",
            "sidebar",
        ],
    )
}

fn list_looks_navigation_like(element: ElementRef<'_>) -> bool {
    let item_selector = Selector::parse("li").expect("valid selector");
    let items = element.select(&item_selector).collect::<Vec<_>>();
    if items.is_empty() {
        return false;
    }

    let short_items = items
        .iter()
        .filter(|item| text_from_element(**item).chars().count() < 60)
        .count();
    let linked_items = items
        .iter()
        .filter(|item| {
            let item_text = text_from_element(**item);
            let link_density = get_link_density_readability(**item);
            link_density > 0.5 || (item_text.chars().count() < 90 && link_density > 0.25)
        })
        .count();

    short_items * 2 >= items.len() && linked_items * 2 >= items.len()
}

fn is_probably_data_table(element: ElementRef<'_>) -> bool {
    if element.value().name() != "table" {
        return false;
    }

    if matches!(element.attr("role"), Some("presentation"))
        || matches!(element.attr("datatable"), Some("0"))
    {
        return false;
    }
    if element.attr("summary").is_some() {
        return true;
    }
    if count_descendants_any(
        element,
        &["caption", "col", "colgroup", "tfoot", "thead", "th"],
    ) > 0
    {
        return true;
    }
    if count_descendants(element, "table") > 0 {
        return false;
    }

    let row_selector = Selector::parse("tr").expect("valid selector");
    let cell_selector = Selector::parse("th, td").expect("valid selector");
    let rows = element.select(&row_selector).collect::<Vec<_>>();
    if rows.is_empty() {
        return false;
    }

    let row_count = rows.len();
    let column_count = rows
        .iter()
        .map(|row| row.select(&cell_selector).count())
        .max()
        .unwrap_or(0);

    if row_count <= 1 || column_count <= 1 {
        return false;
    }
    if row_count >= 10 || column_count > 4 {
        return true;
    }

    row_count * column_count > 10
}

fn code_text_from_element(element: ElementRef<'_>) -> String {
    let raw = element.text().collect::<Vec<_>>().join("");
    let mut lines = Vec::new();

    for line in raw.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() {
            if !lines
                .last()
                .map(|value: &String| value.is_empty())
                .unwrap_or(false)
            {
                lines.push(String::new());
            }
            continue;
        }
        lines.push(trimmed.to_string());
    }

    lines.join("\n").trim().to_string()
}

fn table_text_from_element(element: ElementRef<'_>) -> String {
    let caption_selector = Selector::parse("caption").expect("valid selector");
    let row_selector = Selector::parse("tr").expect("valid selector");
    let cell_selector = Selector::parse("th, td").expect("valid selector");
    let mut rows = Vec::new();

    for caption in element.select(&caption_selector) {
        let text = text_from_element(caption);
        if !text.is_empty() {
            rows.push(text);
        }
    }

    for row in element.select(&row_selector) {
        let cells = row
            .select(&cell_selector)
            .map(text_from_element)
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>();
        if !cells.is_empty() {
            rows.push(cells.join(" | "));
        }
    }

    if rows.is_empty() {
        text_from_element(element)
    } else {
        rows.join("\n")
    }
}

fn join_block_text(blocks: &[ArticleBlock]) -> String {
    truncate_chars(
        &blocks
            .iter()
            .map(|block| block.text.clone())
            .collect::<Vec<_>>()
            .join("\n\n"),
        MAX_SOURCE_CHARS,
    )
}

fn normalize_optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(normalize_text)
        .filter(|text| !text.is_empty())
}

fn normalize_text(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut last_was_space = false;

    for ch in input.chars() {
        if ch.is_whitespace() {
            if !last_was_space {
                result.push(' ');
                last_was_space = true;
            }
        } else {
            result.push(ch);
            last_was_space = false;
        }
    }

    result.trim().to_string()
}

fn is_probable_boilerplate(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    [
        "share this",
        "related articles",
        "all rights reserved",
        "subscribe",
        "sign in",
        "cookie",
        "privacy policy",
    ]
    .iter()
    .any(|term| lower.contains(term))
}

fn build_summary(
    title: Option<&str>,
    cleaned_text: &str,
    excerpt: Option<&str>,
    max_sentences: usize,
    max_chars: usize,
) -> String {
    let sentences = split_sentences(cleaned_text);
    if sentences.is_empty() {
        return truncate_chars(cleaned_text, max_chars);
    }

    let frequencies = build_token_frequency(&sentences);
    let title_tokens = title.map(tokenize).unwrap_or_default();
    let excerpt_tokens = excerpt.map(tokenize).unwrap_or_default();

    let mut scored = sentences
        .iter()
        .enumerate()
        .filter_map(|(index, sentence)| {
            let tokens = tokenize(sentence);
            if tokens.is_empty() {
                return None;
            }

            let token_score = tokens
                .iter()
                .map(|token| *frequencies.get(token).unwrap_or(&0.0))
                .sum::<f64>();
            let title_overlap = overlap_score(&tokens, &title_tokens) * 1.6;
            let excerpt_overlap = overlap_score(&tokens, &excerpt_tokens) * 1.4;
            let position_bonus = match index {
                0 => 2.8,
                1 => 1.8,
                2 => 1.0,
                _ => 0.0,
            };
            let length_penalty = if sentence.chars().count() > 220 {
                1.6
            } else {
                0.0
            };
            let score =
                token_score + title_overlap + excerpt_overlap + position_bonus - length_penalty;

            Some(SentenceCandidate {
                index,
                text: sentence.clone(),
                score,
            })
        })
        .collect::<Vec<_>>();

    scored.sort_by(|left, right| right.score.total_cmp(&left.score));

    let mut selected = scored
        .into_iter()
        .take(max_sentences.saturating_mul(2))
        .collect::<Vec<_>>();
    selected.sort_by_key(|candidate| candidate.index);

    let mut summary_parts = Vec::new();
    let mut used_chars = 0usize;

    for candidate in selected {
        let sentence_chars = candidate.text.chars().count();
        let separator_chars = if summary_parts.is_empty() { 0 } else { 1 };
        if !summary_parts.is_empty() && used_chars + separator_chars + sentence_chars > max_chars {
            continue;
        }
        summary_parts.push(candidate.text);
        used_chars += separator_chars + sentence_chars;
        if summary_parts.len() >= max_sentences {
            break;
        }
    }

    if summary_parts.is_empty() {
        return truncate_chars(&sentences[0], max_chars);
    }

    let joined = summary_parts.join(" ");
    if joined.chars().count() <= max_chars {
        joined
    } else {
        truncate_chars(&joined, max_chars)
    }
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if SENTENCE_SPLITTERS.contains(&ch) {
            push_sentence(&mut sentences, &mut current);
        }
    }

    push_sentence(&mut sentences, &mut current);
    sentences
}

fn push_sentence(sentences: &mut Vec<String>, current: &mut String) {
    let normalized = normalize_text(current);
    if normalized.chars().count() >= 18 {
        sentences.push(normalized);
    }
    current.clear();
}

fn build_token_frequency(sentences: &[String]) -> HashMap<String, f64> {
    let mut frequency = HashMap::new();

    for sentence in sentences {
        for token in tokenize(sentence) {
            *frequency.entry(token).or_insert(0.0) += 1.0;
        }
    }

    frequency
}

fn build_block_token_frequency(blocks: &[&ArticleBlock]) -> HashMap<String, f64> {
    let mut frequency = HashMap::new();

    for block in blocks {
        for token in tokenize(&block.text) {
            *frequency.entry(token).or_insert(0.0) += 1.0;
        }
    }

    frequency
}

fn tokenize(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut ascii_token = String::new();

    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            ascii_token.push(ch.to_ascii_lowercase());
            continue;
        }

        if !ascii_token.is_empty() {
            tokens.push(std::mem::take(&mut ascii_token));
        }

        if is_cjk(ch) {
            tokens.push(ch.to_string());
        }
    }

    if !ascii_token.is_empty() {
        tokens.push(ascii_token);
    }

    tokens
}

fn estimate_tokens(text: &str) -> usize {
    let token_count = tokenize(text).len();
    let char_estimate = text.chars().count().div_ceil(6);
    token_count.max(char_estimate).max(1)
}

fn overlap_score(tokens: &[String], reference: &[String]) -> f64 {
    if tokens.is_empty() || reference.is_empty() {
        return 0.0;
    }

    let reference = reference.iter().collect::<HashSet<_>>();
    let overlap = tokens
        .iter()
        .filter(|token| reference.contains(token))
        .count();

    overlap as f64 / tokens.len() as f64
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    let chars = text.chars().collect::<Vec<_>>();
    if chars.len() <= max_chars {
        return text.to_string();
    }

    let truncated = chars.into_iter().take(max_chars).collect::<String>();
    format!("{}...", truncated.trim_end())
}

fn is_cjk(ch: char) -> bool {
    matches!(
        ch as u32,
        0x4E00..=0x9FFF
            | 0x3400..=0x4DBF
            | 0x3040..=0x309F
            | 0x30A0..=0x30FF
            | 0xAC00..=0xD7AF
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const ARTICLE_FIXTURE: &str = include_str!("../fixtures/rust-core-v2/article.html");
    const DISCUSSION_THREAD_FIXTURE: &str =
        include_str!("../fixtures/rust-core-v2/discussion-thread.html");
    const DOCS_PAGE_FIXTURE: &str = include_str!("../fixtures/rust-core-v2/docs-page.html");
    const MIXED_LANGUAGE_FIXTURE: &str =
        include_str!("../fixtures/rust-core-v2/mixed-language.html");
    const MDN_ARRAY_MAP_FIXTURE: &str = include_str!("../fixtures/rust-core-v2/mdn-array-map.html");
    const PAYWALLED_PAGE_FIXTURE: &str =
        include_str!("../fixtures/rust-core-v2/paywalled-page.html");
    const SEARCH_RESULTS_FIXTURE: &str =
        include_str!("../fixtures/rust-core-v2/search-results.html");

    #[test]
    fn process_article_prefers_html_blocks_and_builds_prompt_payload() {
        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/rust-core-v2".to_string()),
            title: Some("Rust Core V2".to_string()),
            lang: Some("en".to_string()),
            meta_description: Some("Structured extraction for browser summaries.".to_string()),
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(ARTICLE_FIXTURE.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("article should be processed");

        assert_eq!(result.source, "html-primary");
        assert!(result.blocks.len() >= 3);
        assert!(
            result
                .prompt_payload
                .compressed_context
                .contains("prompt-ready payload")
        );
        assert!(!result.prompt_payload.key_points.is_empty());
        assert!(
            result.prompt_payload.token_budget_used <= result.prompt_payload.token_budget_target
        );
    }

    #[test]
    fn process_article_uses_selection_when_available() {
        let selection = "Rust Core V2 keeps the extraction pipeline deterministic and structured.\n\nIt returns ranked blocks, outline data, and a compressed context payload for the popup.";

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/selection".to_string()),
            title: Some("Selection flow".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: Some(selection.to_string()),
            text_content: Some("fallback text".to_string()),
            html: Some("<html><body><p>fallback</p></body></html>".to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("selection should be processed");

        assert_eq!(result.source, "selection");
        assert!(matches!(result.quality.page_type, PageType::Selection));
        assert!(result.cleaned_text.contains("compressed context payload"));
        assert!(
            result
                .prompt_payload
                .selection_strategy
                .starts_with("ranked-blocks")
        );
    }

    #[test]
    fn process_article_classifies_search_results_pages() {
        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/search?q=rust+extension".to_string()),
            title: Some("Search results for rust extension".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(SEARCH_RESULTS_FIXTURE.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("search result page should still be processed");

        assert!(matches!(result.quality.page_type, PageType::SearchResults));
        assert!(!result.quality.safe_to_summarize);
    }

    #[test]
    fn process_article_classifies_discussion_threads() {
        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/forum/thread/rust-article-extraction".to_string()),
            title: Some("Forum discussion about Rust article extraction".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(DISCUSSION_THREAD_FIXTURE.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("discussion thread should be processed");

        assert!(matches!(
            result.quality.page_type,
            PageType::DiscussionThread
        ));
        assert!(!result.quality.safe_to_summarize);
    }

    #[test]
    fn process_article_extracts_hacker_news_comment_threads() {
        let html = r#"
        <html lang="en" op="item">
          <head>
            <title>I don't know if my job will still exist in ten years | Hacker News</title>
          </head>
          <body>
            <table class="fatitem">
              <tr>
                <td class="title">
                  <span class="titleline">
                    <a href="https://example.com/post">I don't know if my job will still exist in ten years</a>
                  </span>
                </td>
              </tr>
            </table>
            <table class="comment-tree">
              <tr class="athing comtr">
                <td>
                  <div class="comment">
                    <div class="commtext c00">
                      Out of curiosity I checked out the author's resume and this is their current position.
                      Oh the irony. I built significant pieces of Copilot and other projects.
                    </div>
                    <div class="reply">reply</div>
                  </div>
                </td>
              </tr>
              <tr class="athing comtr">
                <td>
                  <div class="comment">
                    <div class="commtext c00">
                      Due to a text predictor? I'm a daily user of modern models and they reduce
                      cognitive load, but reliability is still a real limitation in practice.
                    </div>
                    <div class="reply">reply</div>
                  </div>
                </td>
              </tr>
              <tr class="athing comtr">
                <td>
                  <div class="comment">
                    <div class="commtext c00">
                      The next decade is going to be interesting. Companies will keep testing the
                      limits of these tools while engineers adapt around them.
                    </div>
                    <div class="reply">reply</div>
                  </div>
                </td>
              </tr>
            </table>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://news.ycombinator.com/item?id=47292902".to_string()),
            title: Some(
                "I don't know if my job will still exist in ten years | Hacker News".to_string(),
            ),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("hacker news discussion thread should be processed");

        assert!(matches!(
            result.quality.page_type,
            PageType::DiscussionThread
        ));
        assert!(result.blocks.len() >= 3);
        assert!(result.cleaned_text.contains("Due to a text predictor"));
        assert!(!result.cleaned_text.contains("reply"));
    }

    #[test]
    fn process_article_keeps_broader_prompt_context_for_discussion_threads() {
        let html = r#"
        <html lang="en" op="item">
          <head>
            <title>Long Hacker News thread | Hacker News</title>
          </head>
          <body>
            <table class="fatitem">
              <tr>
                <td class="title">
                  <span class="titleline">
                    <a href="https://example.com/post">Long Hacker News thread</a>
                  </span>
                </td>
              </tr>
            </table>
            <table class="comment-tree">
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">The original poster says agent tooling changes how programming feels because the work becomes more about supervising outputs than directly shaping the code path line by line.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">An early reply argues that the mental overhead comes from constant context switching and waiting for tool output instead of staying in a tight edit run debug loop.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Another comment says the real issue is management pressure because companies can use these tools to push longer hours and more review work onto the same engineers.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">A mid thread comment points out that code review quality matters more than raw generation speed and asks whether anyone is actually reading the machine produced diffs carefully.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Someone else says the tools are useful for chores and glue work but still unreliable enough that high stakes code needs a human who understands the whole system.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">One reply compares this to earlier automation waves and says there is still no silver bullet because software engineering remains constrained by requirements ambiguity and system complexity.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Later in the thread a commenter says they now make more out of hour commits because the machine can grind through low priority tasks after the normal work day ends.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">A different branch says the upside is better work life balance because automation removes drudge work and helps the team spend weekends offline for the first time in years.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Another commenter pushes back that reviewing generated code has always been part of development and that understanding the codebase matters more than who or what typed the first draft.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Near the end a reply questions the productivity claims and asks whether the hidden cost of verification is being counted at all when teams evaluate these tools.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">The final stretch of the discussion turns to hiring and says junior engineers may find it harder to build intuition if they mostly supervise generated patches instead of writing them.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">The last visible comment says the long term effect is still uncertain but the thread clearly shows multiple viewpoints rather than one single article thesis.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Another short reply says teams now need explicit review rules because otherwise generated code silently widens the amount of unexamined change landing in production.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">One person adds that agent workflows can be productive for migrations and repetitive chores, but they still slow down when the problem is ambiguous or domain heavy.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">A follow up notes that onboarding may degrade if juniors learn to prompt first and only read the resulting patch after the machine has already chosen the shape of the code.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Someone near the bottom says long discussions like this are exactly why summaries need breadth, because the key value is the spread of opinions rather than a single canonical answer.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">A practical comment says the best use so far is drafting tests, shell scripts, and one off data cleanup, while core system design still requires direct human ownership.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">Another reply argues the real productivity metric should subtract the time spent reading, validating, and sometimes completely redoing code that looked plausible on first pass.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">One of the last comments says the emotional cost matters too, because supervising machines can feel less satisfying than building things directly even when output volume goes up.</div></div></td></tr>
              <tr class="athing comtr"><td><div class="comment"><div class="commtext c00">The thread closes with a concise point that the technology may stay useful, but the organizational incentives around it will determine whether developers experience relief or pressure.</div></div></td></tr>
            </table>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://news.ycombinator.com/item?id=47292574".to_string()),
            title: Some("Long Hacker News thread | Hacker News".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(6000),
            max_prompt_tokens: Some(1600),
        })
        .expect("long discussion thread should be processed");

        assert!(matches!(
            result.quality.page_type,
            PageType::DiscussionThread
        ));
        assert_eq!(
            result.prompt_payload.selection_strategy,
            "discussion-ranked-blocks-breadth-first"
        );
        assert!(result.prompt_payload.supporting_blocks.len() > 14);
        assert!(
            result
                .prompt_payload
                .compressed_context
                .contains("The original poster says agent tooling changes how programming feels")
        );
        assert!(
            result
                .prompt_payload
                .compressed_context
                .contains("The final stretch of the discussion turns to hiring")
        );
    }

    #[test]
    fn process_article_handles_div_wrapped_paragraphs_like_readability() {
        let html = r#"
        <html lang="en">
          <body>
            <main class="content post">
              <div>
                Fire Summary moved the extraction pipeline into Rust so the browser extension can
                build a deterministic prompt payload without depending on a mutable DOM parser.
              </div>
              <div>
                Readability-style scoring helps recover paragraphs even when publishers wrap each
                paragraph in presentational div tags instead of semantic paragraph elements.
              </div>
              <div class="share-tools">Share this article</div>
            </main>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/blog/div-paragraphs".to_string()),
            title: Some("Div wrapped paragraphs".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("div paragraphs should be processed");

        assert!(result.cleaned_text.contains("deterministic prompt payload"));
        assert!(result.cleaned_text.contains("presentational div tags"));
        assert!(!result.cleaned_text.contains("Share this article"));
    }

    #[test]
    fn process_article_merges_article_siblings_like_readability() {
        let html = r#"
        <html lang="en">
          <body>
            <div class="article-shell">
              <div class="article-body">
                <p>
                  The first section explains why a deterministic extraction pipeline matters for
                  browser-side summarization and how candidate scoring picks the main content node.
                </p>
              </div>
              <div class="ad-break">Advertisement</div>
              <div class="article-body">
                <p>
                  The second section is a continuation of the same story and should be merged with
                  the first because it shares the same article-body class and long-form density.
                </p>
              </div>
            </div>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/blog/sibling-merge".to_string()),
            title: Some("Sibling merge".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("sibling article sections should be processed");

        assert!(
            result
                .cleaned_text
                .contains("deterministic extraction pipeline")
        );
        assert!(
            result
                .cleaned_text
                .contains("continuation of the same story")
        );
        assert!(!result.cleaned_text.contains("Advertisement"));
        assert_eq!(
            result
                .blocks
                .iter()
                .map(|block| block.id.as_str())
                .collect::<HashSet<_>>()
                .len(),
            result.blocks.len()
        );
    }

    #[test]
    fn process_article_ignores_inline_scripts_in_article_shells() {
        let html = r#"
        <html lang="en">
          <body>
            <main>
              <script>
                (() => { const astro = { hydrate: true, props: { title: "fake content" } }; return astro; })();
              </script>
              <article class="post-content">
                <h1>Open-Sourcing Sarvam 30B and 105B</h1>
                <p>
                  We are releasing two open models trained from scratch with in-house data,
                  supervised fine-tuning, and reinforcement learning systems.
                </p>
                <p>
                  The article then explains architecture, training, and benchmark results in a
                  standard long-form blog layout.
                </p>
              </article>
            </main>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/blog/astro-inline-script".to_string()),
            title: Some("Open-Sourcing Sarvam 30B and 105B".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("article with inline scripts should be processed");

        assert!(result.cleaned_text.contains("trained from scratch"));
        assert!(!result.cleaned_text.contains("const astro"));
        assert!(
            result
                .blocks
                .iter()
                .all(|block| !block.text.contains("hydrate: true"))
        );
        assert!(
            result
                .blocks
                .iter()
                .any(|block| block.text.contains("benchmark results"))
        );
    }

    #[test]
    fn process_article_reads_astro_template_rich_text_content() {
        let html = r#"
        <html lang="en">
          <body>
            <main>
              <astro-island>
                <template data-astro-template>
                  <div class="max-w-none overflow-visible">
                    <h1>Open-Sourcing Sarvam 30B and 105B</h1>
                    <p>
                      We are releasing two reasoning models trained from scratch on in-house data
                      pipelines spanning pre-training, supervised fine-tuning, and reinforcement
                      learning.
                    </p>
                    <h2>Architecture</h2>
                    <p>
                      Both models share a Mixture-of-Experts architecture designed for efficient
                      deployment and long-context inference.
                    </p>
                  </div>
                </template>
              </astro-island>
              <template>
                <p>Do not include this generic template payload.</p>
              </template>
            </main>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/blog/astro-template".to_string()),
            title: Some("Open-Sourcing Sarvam 30B and 105B".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("astro template content should be processed");

        assert!(
            result
                .cleaned_text
                .contains("releasing two reasoning models")
        );
        assert!(
            result
                .cleaned_text
                .contains("Mixture-of-Experts architecture")
        );
        assert!(!result.cleaned_text.contains("generic template payload"));
    }

    #[test]
    fn process_article_prompt_payload_keeps_article_lead_before_noisy_demo_sections() {
        let html = r#"
        <html lang="en">
          <body>
            <article class="post-content">
              <h1>Open-Sourcing Sarvam 30B and 105B</h1>
              <p>
                We are releasing two open reasoning models trained from scratch with in-house
                datasets and full-stack optimization across training and inference.
              </p>
              <p>
                The article first explains architecture, training, and benchmark results before
                moving into several interactive demo sections.
              </p>
              <p>
                These opening paragraphs are the core framing for the article and should remain in
                the prompt payload even if later sections are unusually noisy.
              </p>
              <h2>Architecture</h2>
              <p>
                The architecture section explains the Mixture-of-Experts design, training stack,
                and deployment tradeoffs for the released models.
              </p>
              <h2>Demos</h2>
              <h3>JEE Mains 2026</h3>
              <h4>Tutor Mode</h4>
              <p>You nailed it! Option C is correct.</p>
              <p>The Boltzmann constant sits right in the numerator of the formula.</p>
              <ul>
                <li>Identified the collision cross-section correctly.</li>
                <li>Managed the powers of ten correctly.</li>
                <li>2-3 సార్లు ఆడిన తర్వాత మీ స్థాయిని బట్టి కోర్టును బుక్ చేసుకోండి</li>
              </ul>
            </article>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/blog/noisy-demo-article".to_string()),
            title: Some("Open-Sourcing Sarvam 30B and 105B".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("article with noisy demos should be processed");

        assert!(
            result
                .prompt_payload
                .selection_strategy
                .starts_with("ranked-blocks-lead-plus")
        );
        assert!(
            result
                .prompt_payload
                .compressed_context
                .contains("We are releasing two open reasoning models")
        );
        assert!(
            result
                .prompt_payload
                .compressed_context
                .contains("architecture, training, and benchmark results")
        );
        assert!(
            result
                .prompt_payload
                .compressed_context
                .contains("Mixture-of-Experts design")
        );
        assert!(
            !result
                .prompt_payload
                .supporting_blocks
                .iter()
                .any(|block| block.contains("Option C is correct"))
        );
    }

    #[test]
    fn extract_structured_blocks_handles_mdn_main_content() {
        let document = Html::parse_document(MDN_ARRAY_MAP_FIXTURE);
        let selector = Selector::parse("main#content").expect("valid selector");
        let main = document
            .select(&selector)
            .next()
            .expect("mdn main content should exist");

        let blocks = extract_structured_blocks(main);

        assert!(
            blocks.len() >= 8,
            "expected multiple blocks, got {}",
            blocks.len()
        );
        assert!(blocks.iter().any(|block| block.text.contains("Syntax")));
        assert!(
            blocks
                .iter()
                .any(|block| block.text.contains("Return value"))
        );
    }

    #[test]
    fn process_article_drops_navigation_like_lists() {
        let html = r#"
        <html lang="en">
          <body>
            <article class="post-content">
              <p>
                This article explains how readability-style extraction should keep the core essay
                while ignoring navigation widgets and related-story sidecars.
              </p>
              <ul class="related-links">
                <li><a href="/a">Related post one</a></li>
                <li><a href="/b">Related post two</a></li>
                <li><a href="/c">Related post three</a></li>
                <li><a href="/d">Related post four</a></li>
              </ul>
              <p>
                The concluding paragraph continues the article and should remain part of the final
                extracted text after conditional cleaning.
              </p>
            </article>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/blog/navigation-list".to_string()),
            title: Some("Navigation list cleanup".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("navigation-like list should be processed");

        assert!(result.cleaned_text.contains("core essay"));
        assert!(result.cleaned_text.contains("concluding paragraph"));
        assert!(!result.cleaned_text.contains("Related post one"));
    }

    #[test]
    fn process_article_keeps_data_tables_after_conditional_clean() {
        let html = r#"
        <html lang="en">
          <body>
            <article class="docs-page">
              <p>
                The configuration reference below is part of the main article and should remain in
                the extracted output.
              </p>
              <table>
                <caption>CLI Flags</caption>
                <tr><th>Flag</th><th>Description</th></tr>
                <tr><td>--verify</td><td>Validate imported fixtures before publishing.</td></tr>
                <tr><td>--snapshot</td><td>Refresh the stored regression baseline output.</td></tr>
              </table>
            </article>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/docs/reference-table".to_string()),
            title: Some("Reference table".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("data table should be preserved");

        assert!(result.cleaned_text.contains("CLI Flags"));
        assert!(result.cleaned_text.contains("--verify"));
        assert!(result.cleaned_text.contains("Validate imported fixtures"));
    }

    #[test]
    fn process_article_classifies_docs_pages() {
        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/docs/rust-core-diagnostics".to_string()),
            title: Some("Getting Started with Rust Core Diagnostics".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(DOCS_PAGE_FIXTURE.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("docs page should be processed");

        assert!(matches!(result.quality.page_type, PageType::DocsPage));
        assert!(result.quality.safe_to_summarize);
    }

    #[test]
    fn process_article_preserves_table_and_code_blocks_for_docs_pages() {
        let html = r#"
        <html lang="en">
          <body>
            <article class="docs-page">
              <h1>CLI Reference</h1>
              <p>Use the table and command examples below to configure the extension.</p>
              <table>
                <tr><th>Flag</th><th>Description</th></tr>
                <tr><td>--verify</td><td>Validate and run regression after importing a fixture draft.</td></tr>
                <tr><td>--snapshot-baseline</td><td>Refresh the fixture baseline after review.</td></tr>
              </table>
              <pre>node scripts/import-rust-fixture.mjs draft.json --verify --snapshot-baseline</pre>
            </article>
          </body>
        </html>
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/docs/cli-reference".to_string()),
            title: Some("CLI Reference".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("docs page with table and code should be processed");

        assert!(matches!(result.quality.page_type, PageType::DocsPage));
        assert!(
            result
                .blocks
                .iter()
                .any(|block| matches!(block.kind, BlockKind::Table))
        );
        assert!(
            result
                .blocks
                .iter()
                .any(|block| matches!(block.kind, BlockKind::Code))
        );
        assert!(result.prompt_payload.compressed_context.contains("[Table]"));
        assert!(result.prompt_payload.compressed_context.contains("[Code]"));
    }

    #[test]
    fn process_article_handles_mixed_language_articles() {
        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/blog/rust-core-v2-notes".to_string()),
            title: Some("Rust Core v2 上線筆記".to_string()),
            lang: Some("zh-Hant".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(MIXED_LANGUAGE_FIXTURE.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("mixed-language article should be processed");

        assert!(matches!(result.quality.page_type, PageType::Article));
        assert!(result.quality.safe_to_summarize);
    }

    #[test]
    fn process_article_uses_visible_text_when_html_is_incomplete() {
        let html = r#"
        <html lang="en">
          <body>
            <main>
              <article class="metered-preview">
                <h1>Story preview</h1>
                <p>
                  This preview shell contains only a short teaser and no article body.
                </p>
              </article>
            </main>
          </body>
        </html>
        "#;
        let visible_text = r#"
Why paid readers still need local extraction
Member-only story
Listen
Share
Subscribe to unlock every story on Medium.

Paid readers can see the full article in the rendered page, but a browser extension still has to choose the right source text from the document it receives.

When the semantic article container is replaced by membership prompts, visible text can be a better fallback because it reflects what the user is actually allowed to read.

The extraction pipeline should prefer that visible article body only when it is substantially longer, structured like an article, and safer to summarize than the HTML candidate.

This keeps normal websites on the higher precision HTML path while allowing legitimate subscribers to summarize the stories they can already see in their browser.
        "#;

        let result = process_article_input(ArticleInput {
            url: Some("https://medium.com/@reader/local-extraction-for-paid-stories".to_string()),
            title: Some("Why paid readers still need local extraction".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: Some(visible_text.to_string()),
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("visible paid article text should be processed");

        assert_eq!(result.source, "text-fallback");
        assert!(matches!(result.quality.page_type, PageType::Article));
        assert!(result.quality.safe_to_summarize);
        assert!(
            result
                .cleaned_text
                .contains("legitimate subscribers to summarize")
        );
        assert!(!result.cleaned_text.contains("short teaser"));
        assert!(
            result
                .quality
                .warnings
                .iter()
                .any(|warning| warning.contains("visible page text"))
        );
    }

    #[test]
    fn process_article_preserves_short_text_fallback_as_sparse_page() {
        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/login".to_string()),
            title: Some("Sign in".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: Some("Please sign in to continue.".to_string()),
            html: Some(
                "<html><body><main><p>Please sign in to continue.</p></main></body></html>"
                    .to_string(),
            ),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("short text fallback should still be classified");

        assert_eq!(result.source, "text-fallback");
        assert!(matches!(result.quality.page_type, PageType::SparsePage));
        assert!(!result.quality.safe_to_summarize);
        assert_eq!(result.cleaned_text, "Please sign in to continue.");
    }

    #[test]
    fn process_article_classifies_paywalled_pages() {
        let result = process_article_input(ArticleInput {
            url: Some("https://example.com/paywall/rust-browser-analysis".to_string()),
            title: Some("Subscriber-only analysis: Rust in the browser".to_string()),
            lang: Some("en".to_string()),
            meta_description: None,
            canonical_url: None,
            byline: None,
            published_time: None,
            selection_text: None,
            text_content: None,
            html: Some(PAYWALLED_PAGE_FIXTURE.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("paywalled page should be processed");

        assert!(matches!(result.quality.page_type, PageType::PaywalledPage));
        assert!(!result.quality.safe_to_summarize);
    }
}
