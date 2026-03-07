use scraper::{ElementRef, Html, Selector};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

const MIN_BLOCK_CHARS: usize = 40;
const DEFAULT_SUMMARY_SENTENCES: usize = 3;
const DEFAULT_SUMMARY_CHARS: usize = 320;
const MAX_SOURCE_CHARS: usize = 12_000;
const SENTENCE_SPLITTERS: [char; 8] = ['。', '！', '？', '.', '!', '?', ';', '；'];
const IGNORED_TAGS: [&str; 11] = [
    "nav", "aside", "footer", "header", "script", "style", "noscript", "form", "button", "svg",
    "canvas",
];

#[derive(Debug, Deserialize)]
pub struct ArticleInput {
    pub title: Option<String>,
    #[serde(alias = "textContent", alias = "text")]
    pub text_content: Option<String>,
    pub excerpt: Option<String>,
    pub html: Option<String>,
    pub max_sentences: Option<usize>,
    pub max_chars: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct SummaryResult {
    pub title: Option<String>,
    pub cleaned_text: String,
    pub summary: String,
    pub excerpt: Option<String>,
    pub source: String,
    pub stats: SummaryStats,
}

#[derive(Debug, Serialize)]
pub struct SummaryStats {
    pub cleaned_chars: usize,
    pub sentence_count: usize,
    pub selected_sentences: usize,
}

#[derive(Debug, Clone)]
struct SentenceCandidate {
    index: usize,
    text: String,
    score: f64,
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
    let input: ArticleInput = serde_wasm_bindgen::from_value(input)
        .map_err(|err| JsValue::from_str(&format!("invalid input: {err}")))?;

    let mut cleaned_text = normalize_text(input.text_content.unwrap_or_default().as_str());
    let source = if !cleaned_text.is_empty() {
        "readability".to_string()
    } else if let Some(html) = input.html.as_deref() {
        cleaned_text = extract_main_text_from_html(html);
        "html-fallback".to_string()
    } else {
        "empty".to_string()
    };

    if cleaned_text.is_empty() {
        return Err(JsValue::from_str("no usable article text"));
    }

    let max_sentences = input
        .max_sentences
        .unwrap_or(DEFAULT_SUMMARY_SENTENCES)
        .max(1);
    let max_chars = input.max_chars.unwrap_or(DEFAULT_SUMMARY_CHARS).max(120);
    let summary = build_summary(
        input.title.as_deref(),
        &cleaned_text,
        input.excerpt.as_deref(),
        max_sentences,
        max_chars,
    );

    let stats = SummaryStats {
        cleaned_chars: cleaned_text.chars().count(),
        sentence_count: split_sentences(&cleaned_text).len(),
        selected_sentences: split_sentences(&summary).len(),
    };

    let result = SummaryResult {
        title: input.title,
        cleaned_text,
        summary,
        excerpt: input.excerpt,
        source,
        stats,
    };

    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("failed to serialize summary result: {err}")))
}

fn extract_main_text_from_html(html: &str) -> String {
    let document = Html::parse_document(html);
    let best_candidate = find_best_candidate(&document);

    if let Some(candidate) = best_candidate {
        let blocks = extract_blocks(candidate);
        let normalized = normalize_blocks(blocks);
        if !normalized.is_empty() {
            return normalized;
        }
    }

    let fallback_selector =
        Selector::parse("article, main, p, h1, h2, h3, li, blockquote").expect("valid selector");
    let fallback_blocks = document
        .select(&fallback_selector)
        .filter(|element| !is_inside_ignored_context(*element))
        .map(text_from_element)
        .collect::<Vec<_>>();
    normalize_blocks(fallback_blocks)
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

fn normalize_blocks(blocks: Vec<String>) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut cleaned = Vec::new();

    for block in blocks.into_iter().map(|block| normalize_text(&block)) {
        if block.chars().count() < MIN_BLOCK_CHARS {
            continue;
        }
        if seen.insert(block.clone()) {
            cleaned.push(block);
        }
    }

    truncate_chars(&cleaned.join("\n\n"), MAX_SOURCE_CHARS)
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

fn build_token_frequency(sentences: &[String]) -> std::collections::HashMap<String, f64> {
    let mut frequency = std::collections::HashMap::new();

    for sentence in sentences {
        for token in tokenize(sentence) {
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

fn overlap_score(tokens: &[String], reference: &[String]) -> f64 {
    if tokens.is_empty() || reference.is_empty() {
        return 0.0;
    }

    let reference = reference.iter().collect::<std::collections::HashSet<_>>();
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
