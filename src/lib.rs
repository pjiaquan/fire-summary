use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use wasm_bindgen::prelude::*;

const MIN_BLOCK_CHARS: usize = 40;
const MIN_LIST_ITEM_CHARS: usize = 20;
const MIN_HEADING_CHARS: usize = 4;
const MIN_SELECTION_CHARS: usize = 80;
const DEFAULT_SUMMARY_SENTENCES: usize = 3;
const DEFAULT_SUMMARY_CHARS: usize = 320;
const DEFAULT_PROMPT_CHARS: usize = 3600;
const DEFAULT_PROMPT_TOKENS: usize = 900;
const MAX_SOURCE_CHARS: usize = 12_000;
const MAX_PROMPT_CHARS: usize = 6000;
const MAX_PROMPT_TOKENS: usize = 1600;
const MAX_SUPPORTING_BLOCKS: usize = 6;
const SENTENCE_SPLITTERS: [char; 8] = ['。', '！', '？', '.', '!', '?', ';', '；'];
const IGNORED_TAGS: [&str; 11] = [
    "nav", "aside", "footer", "header", "script", "style", "noscript", "form", "button", "svg",
    "canvas",
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
    SearchResults,
    ListingPage,
    ProductPage,
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
    let ranked_blocks = rank_blocks(&extracted.blocks, title.as_deref(), excerpt.as_deref());
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
            return Some(extracted);
        }
    }

    let cleaned_text = normalize_optional(text_content)?;
    if cleaned_text.chars().count() < MIN_BLOCK_CHARS {
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

    Some(StructuredExtraction {
        outline: Vec::new(),
        blocks,
        cleaned_text,
        source: "text-fallback".to_string(),
        quality,
    })
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
    let best_candidate = find_best_candidate(&document);

    let mut blocks = if let Some(candidate) = best_candidate {
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
            if preferred_score * 0.9 >= generic_score {
                Some(preferred_node)
            } else {
                Some(generic_node)
            }
        }
        (Some((_, node)), None) | (None, Some((_, node))) => Some(node),
        (None, None) => None,
    }
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
    let selector =
        Selector::parse("h1, h2, h3, h4, p, li, blockquote, pre").expect("valid selector");

    let blocks = element
        .select(&selector)
        .filter(|child| !is_inside_ignored_context(*child))
        .map(text_from_element)
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
    let selector =
        Selector::parse("h1, h2, h3, h4, p, li, blockquote, pre").expect("valid selector");
    let mut blocks = Vec::new();
    let mut seen = HashSet::new();
    let mut heading_stack: Vec<(u8, String)> = Vec::new();
    let mut position = 0usize;

    for child in element.select(&selector) {
        if is_inside_ignored_context(child) {
            continue;
        }

        let text = text_from_element(child);
        if text.is_empty() || is_probable_boilerplate(&text) {
            continue;
        }

        let kind = block_kind_from_tag(child.value().name());
        let min_chars = match kind {
            BlockKind::Heading => MIN_HEADING_CHARS,
            BlockKind::ListItem => MIN_LIST_ITEM_CHARS,
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
            heading_stack.iter().map(|(_, title)| title.clone()).collect()
        } else {
            heading_stack.iter().map(|(_, title)| title.clone()).collect()
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

fn extract_fallback_blocks(document: &Html) -> Vec<ArticleBlock> {
    let selector =
        Selector::parse("article, main, p, h1, h2, h3, li, blockquote, pre").expect("valid selector");
    let mut blocks = Vec::new();
    let mut heading_stack: Vec<(u8, String)> = Vec::new();
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

        let kind = block_kind_from_tag(child.value().name());
        let min_chars = match kind {
            BlockKind::Heading => MIN_HEADING_CHARS,
            BlockKind::ListItem => MIN_LIST_ITEM_CHARS,
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
            heading_stack.iter().map(|(_, title)| title.clone()).collect()
        } else {
            heading_stack.iter().map(|(_, title)| title.clone()).collect()
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
            _ => MIN_BLOCK_CHARS,
        };

        if text.chars().count() < min_chars || !seen.insert(text.clone()) {
            continue;
        }

        normalized.push(ArticleBlock {
            text: text.clone(),
            char_count: text.chars().count(),
            estimated_tokens: estimate_tokens(&text),
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
            let unique_token_ratio = tokens.iter().collect::<HashSet<_>>().len() as f64
                / tokens.len() as f64;
            let novelty_bonus = if unique_token_ratio >= 0.72 { 0.25 } else { 0.0 };

            let score = token_score
                + title_overlap * 2.8
                + excerpt_overlap * 2.1
                + position_bonus
                + heading_bonus
                + length_bonus
                + number_bonus;
            let score = score + sentence_bonus + novelty_bonus - list_penalty;
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
    let key_points = split_sentences(summary).into_iter().take(3).collect::<Vec<_>>();
    let block_lookup = blocks
        .iter()
        .map(|block| (block.id.as_str(), block))
        .collect::<HashMap<_, _>>();
    let mut supporting_blocks = Vec::new();
    let mut compressed_sections = Vec::new();
    let mut used_chars = 0usize;
    let mut used_tokens = estimate_tokens(&article_header);
    let mut used_sections = HashSet::new();

    for ranked in ranked_blocks.iter().take(MAX_SUPPORTING_BLOCKS.saturating_mul(2)) {
        let Some(block) = block_lookup.get(ranked.block_id.as_str()) else {
            continue;
        };

        let block_text = format_block_for_prompt(block);
        if supporting_blocks.contains(&block_text) {
            continue;
        }
        let section_key = block
            .heading_path
            .last()
            .cloned()
            .unwrap_or_else(|| format!("__lead-{}", block.position));
        let block_tokens = estimate_tokens(&block_text);
        let is_new_section = used_sections.insert(section_key.clone());
        let max_blocks = if is_new_section {
            MAX_SUPPORTING_BLOCKS
        } else {
            MAX_SUPPORTING_BLOCKS.saturating_sub(1)
        };
        if supporting_blocks.len() >= max_blocks && !is_new_section {
            continue;
        }

        let addition = if compressed_sections.is_empty() {
            block_text.chars().count()
        } else {
            block_text.chars().count() + 2
        };
        if used_chars + addition > max_prompt_chars || used_tokens + block_tokens > max_prompt_tokens
        {
            if is_new_section {
                used_sections.remove(&section_key);
            }
            continue;
        }

        used_chars += addition;
        used_tokens += block_tokens;
        supporting_blocks.push(block_text.clone());
        compressed_sections.push(block_text);
        if supporting_blocks.len() >= MAX_SUPPORTING_BLOCKS {
            break;
        }
    }

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
    let token_budget_used =
        estimate_tokens(&article_header) + estimate_tokens(&compressed_context);
    let selection_strategy = if supporting_blocks.is_empty() {
        "fallback-truncate".to_string()
    } else if used_sections.len() > 1 {
        "ranked-blocks-diverse-sections".to_string()
    } else {
        "ranked-blocks".to_string()
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
        .filter(|block| {
            !matches!(block.kind, BlockKind::Heading) && block.char_count < 65
        })
        .count();
    let avg_block_chars = if blocks.is_empty() {
        0.0
    } else {
        blocks.iter().map(|block| block.char_count).sum::<usize>() as f64 / blocks.len() as f64
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

    if cleaned_chars < 220 {
        warnings.push("Extracted article text is short.".to_string());
    }
    if content_blocks < 2 {
        warnings.push("Only a small number of content blocks were extracted.".to_string());
    }
    if avg_block_chars < 55.0 {
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
    } else if cleaned_chars < 180 {
        (PageType::SparsePage, 0.32)
    } else if search_signal && (list_ratio >= 0.35 || short_block_ratio >= 0.45) {
        (PageType::SearchResults, 0.84)
    } else if product_signal && numeric_block_ratio >= 0.25 {
        (PageType::ProductPage, 0.74)
    } else if listing_signal || (list_ratio >= 0.55 && heading_count == 0) {
        (PageType::ListingPage, 0.72)
    } else if content_blocks >= 3 && avg_block_chars >= 70.0 {
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
        warnings.push("This page looks more like a navigation or discovery surface than a single article.".to_string());
    }
    if matches!(page_type, PageType::ProductPage) {
        warnings.push("This page looks like a product or pricing page, so summary quality may be less article-like.".to_string());
    }

    QualityReport {
        page_type: page_type.clone(),
        confidence: confidence.clamp(0.0, 0.99),
        safe_to_summarize: matches!(page_type, PageType::Article | PageType::Selection)
            || (matches!(page_type, PageType::GenericPage) && cleaned_chars >= 260),
        warnings,
    }
}

fn block_kind_from_tag(tag: &str) -> BlockKind {
    match tag {
        "h1" | "h2" | "h3" | "h4" => BlockKind::Heading,
        "li" => BlockKind::ListItem,
        "blockquote" => BlockKind::Quote,
        "pre" => BlockKind::Code,
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

    format!("{path}{}", block.text)
}

fn is_inside_ignored_context(element: ElementRef<'_>) -> bool {
    element
        .ancestors()
        .filter_map(ElementRef::wrap)
        .any(|ancestor| {
            let value = ancestor.value();
            if IGNORED_TAGS.contains(&value.name()) {
                return true;
            }

            [value.id(), value.attr("class")]
                .into_iter()
                .flatten()
                .map(|attr| attr.to_ascii_lowercase())
                .any(|attr| {
                    [
                        "nav", "menu", "footer", "sidebar", "comment", "share", "related", "ads",
                    ]
                    .iter()
                    .any(|term| attr.contains(term))
                })
        })
}

fn text_from_element(element: ElementRef<'_>) -> String {
    normalize_text(&element.text().collect::<Vec<_>>().join(" "))
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

    #[test]
    fn process_article_prefers_html_blocks_and_builds_prompt_payload() {
        let html = r#"
        <html lang="en">
          <body>
            <article class="article-content">
              <h1>Rust Core V2</h1>
              <p>Fire Summary now extracts article blocks directly from HTML instead of relying on a flat body text fallback.</p>
              <p>The new pipeline ranks paragraph blocks, preserves section context, and builds a prompt-ready payload for Gemini.</p>
              <h2>Why it matters</h2>
              <p>This reduces token waste and gives the model a denser context window with clearer structural cues.</p>
            </article>
          </body>
        </html>
        "#;

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
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("article should be processed");

        assert_eq!(result.source, "html-primary");
        assert!(result.blocks.len() >= 3);
        assert!(result.prompt_payload.compressed_context.contains("prompt-ready payload"));
        assert!(!result.prompt_payload.key_points.is_empty());
        assert!(result.prompt_payload.token_budget_used <= result.prompt_payload.token_budget_target);
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
        assert!(result
            .prompt_payload
            .selection_strategy
            .starts_with("ranked-blocks"));
    }

    #[test]
    fn process_article_classifies_search_results_pages() {
        let html = r#"
        <html>
          <body>
            <main>
              <p>Rust wasm browser extension patterns</p>
              <p>Fire Summary GitHub repository and release workflow notes</p>
              <p>Prompt engineering techniques for article summarization</p>
              <p>Extension packaging tips for Firefox Android and desktop</p>
            </main>
          </body>
        </html>
        "#;

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
            html: Some(html.to_string()),
            max_sentences: Some(3),
            max_chars: Some(320),
            max_prompt_chars: Some(1200),
            max_prompt_tokens: Some(900),
        })
        .expect("search result page should still be processed");

        assert!(matches!(result.quality.page_type, PageType::SearchResults));
        assert!(!result.quality.safe_to_summarize);
    }
}
