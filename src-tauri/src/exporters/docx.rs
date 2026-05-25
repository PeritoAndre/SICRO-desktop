//! DOCX export — walks the TipTap JSON content and builds a docx-rs document.
//!
//! Spike C revision after first runtime feedback:
//!   - Paragraphs ALWAYS get at least one Run (Word silently drops paragraphs
//!     without runs).
//!   - Unknown nodes flow through `fallback_paragraph`, which recursively
//!     extracts any text in the subtree, so nothing in the .sicrodoc is lost.
//!   - `tableHeader` is now treated like `tableCell` (the TipTap table
//!     extension emits both kinds, and we don't want to drop the first row
//!     just because it's a header).
//!   - Block nodes nested inside a table cell (storyboard, figure, lists)
//!     are flattened into the cell as a sequence of paragraphs instead of
//!     being misrouted through the inline walker.
//!   - `render_list` no longer carries the dead code that was producing
//!     duplicate bullets.
//!
//! Limitations still in place:
//!   - Images are NOT embedded (only captions / placeholders).
//!   - SystemData inline marks lose the review state (rendered as text).

use std::path::Path;

use docx_rs::*;
use serde_json::Value;

use crate::error::{Result, SicroError};

/// Render the TipTap JSON `content` (the inner value of `.sicrodoc`'s
/// `content` field) into a DOCX file at `target`.
pub fn render_doc_to_docx(envelope: &Value, target: &Path) -> Result<()> {
    let title = envelope
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("Laudo")
        .to_string();
    let content_doc = envelope
        .get("content")
        .ok_or_else(|| SicroError::Validation("sicrodoc missing 'content' field".to_string()))?;
    let blocks = children(content_doc);

    let mut docx = Docx::new().add_paragraph(title_paragraph(&title));

    for node in &blocks {
        docx = render_top_level_block(docx, node);
    }

    let file = std::fs::File::create(target).map_err(|e| {
        SicroError::Filesystem(format!(
            "could not create docx at {}: {}",
            target.display(),
            e
        ))
    })?;
    docx.build()
        .pack(file)
        .map_err(|e| SicroError::Workspace(format!("docx pack failed: {e}")))?;
    Ok(())
}

// ===========================================================================
// Block dispatch (top level)

fn render_top_level_block(docx: Docx, node: &Value) -> Docx {
    match type_of(node) {
        "paragraph" => docx.add_paragraph(paragraph_from_inline(node)),
        "heading" => docx.add_paragraph(heading_paragraph(node)),
        "bulletList" => render_list(docx, node, ListKind::Bullet),
        "orderedList" => render_list(docx, node, ListKind::Ordered),
        "table" => render_table(docx, node),
        "figure" => render_figure_top(docx, node),
        "storyboard" => render_storyboard_top(docx, node),
        "horizontalRule" => docx.add_paragraph(
            Paragraph::new().add_run(Run::new().add_text("────────────────────────────")),
        ),
        // Anything we don't recognise: do our best to surface any text inside.
        _ => docx.add_paragraph(fallback_paragraph(node)),
    }
}

// ===========================================================================
// Paragraph helpers

fn title_paragraph(title: &str) -> Paragraph {
    Paragraph::new()
        .align(AlignmentType::Center)
        .add_run(Run::new().add_text(title).bold().size(36))
}

fn heading_paragraph(node: &Value) -> Paragraph {
    let level = node
        .get("attrs")
        .and_then(|a| a.get("level"))
        .and_then(Value::as_i64)
        .unwrap_or(1);
    let style = match level {
        1 => "Heading1",
        2 => "Heading2",
        _ => "Heading3",
    };
    let size = match level {
        1 => 36, // 18pt (half-points)
        2 => 28, // 14pt
        _ => 24, // 12pt
    };

    let mut p = Paragraph::new().style(style);
    if let Some(al) = paragraph_alignment(node) {
        p = p.align(al);
    }

    let mut runs_added = 0;
    for inline in children(node) {
        for run in inline_to_runs(&inline, Some(size), true) {
            p = p.add_run(run);
            runs_added += 1;
        }
    }
    if runs_added == 0 {
        p = p.add_run(Run::new().add_text("").size(size).bold());
    }
    p
}

/// Build a paragraph from the inline children of `node`. ALWAYS emits at
/// least one Run — Word will drop a paragraph without any run.
fn paragraph_from_inline(node: &Value) -> Paragraph {
    let mut p = Paragraph::new();
    if let Some(al) = paragraph_alignment(node) {
        p = p.align(al);
    }

    let mut runs_added = 0;
    for inline in children(node) {
        for run in inline_to_runs(&inline, None, false) {
            p = p.add_run(run);
            runs_added += 1;
        }
    }
    if runs_added == 0 {
        p = p.add_run(Run::new().add_text(""));
    }
    p
}

fn empty_paragraph() -> Paragraph {
    Paragraph::new().add_run(Run::new().add_text(""))
}

/// Recursively walk the node looking for `text` leaves. If anything is found,
/// emit it as one italic paragraph; otherwise emit a sentinel so the user can
/// tell something was there but wasn't supported.
fn fallback_paragraph(node: &Value) -> Paragraph {
    let mut text = String::new();
    collect_text(node, &mut text);

    if text.trim().is_empty() {
        text = format!(
            "[bloco \"{}\" sem suporte na exportação DOCX]",
            type_of(node)
        );
    }
    Paragraph::new().add_run(Run::new().add_text(text).italic())
}

fn collect_text(node: &Value, buf: &mut String) {
    if type_of(node) == "text" {
        if let Some(t) = node.get("text").and_then(Value::as_str) {
            buf.push_str(t);
        }
        return;
    }
    if type_of(node) == "systemData" {
        if let Some(v) = node
            .get("attrs")
            .and_then(|a| a.get("value"))
            .and_then(Value::as_str)
        {
            buf.push_str(v);
        }
        return;
    }
    for child in children(node) {
        collect_text(&child, buf);
        // Insert a separator between block-level children for readability.
        let kind = type_of(&child);
        if matches!(
            kind,
            "paragraph" | "heading" | "storyboardItem" | "figure" | "table"
        ) {
            buf.push(' ');
        }
    }
}

// ===========================================================================
// Lists

#[derive(Clone, Copy)]
enum ListKind {
    Bullet,
    Ordered,
}

fn render_list(mut docx: Docx, list_node: &Value, kind: ListKind) -> Docx {
    for p in list_to_paragraphs(list_node, kind) {
        docx = docx.add_paragraph(p);
    }
    docx
}

/// Each list item contains paragraphs; we emit one DOCX paragraph per item
/// with the bullet prefixed as the first run. This intentionally avoids the
/// docx-rs numbering machinery — it's simple and prints predictably.
fn list_to_paragraphs(list_node: &Value, kind: ListKind) -> Vec<Paragraph> {
    let items = children(list_node);
    let mut out = Vec::new();

    for (i, item) in items.iter().enumerate() {
        let bullet = match kind {
            ListKind::Bullet => "• ".to_string(),
            ListKind::Ordered => format!("{}. ", i + 1),
        };
        for inner in children(item) {
            let mut p = Paragraph::new().indent(Some(360), None, None, None);
            if let Some(al) = paragraph_alignment(&inner) {
                p = p.align(al);
            }
            p = p.add_run(Run::new().add_text(bullet.clone()));

            for child in children(&inner) {
                for run in inline_to_runs(&child, None, false) {
                    p = p.add_run(run);
                }
            }
            // Bullet itself already counts as a run — paragraph is safe.
            out.push(p);
        }
    }
    out
}

// ===========================================================================
// Tables

fn render_table(docx: Docx, table_node: &Value) -> Docx {
    let rows_json = children(table_node);
    let mut rows: Vec<TableRow> = Vec::new();

    for row_node in &rows_json {
        // We accept any row-shaped node (tableRow is the canonical kind, but
        // we don't gate on it — robustness over strictness for the spike).
        let cells_json = children(row_node);
        let mut cells: Vec<TableCell> = Vec::new();
        for cell_node in &cells_json {
            // Accept both `tableCell` and `tableHeader`; same DOCX cell, the
            // header attribute is currently not styled differently.
            cells.push(build_table_cell(cell_node));
        }
        if !cells.is_empty() {
            rows.push(TableRow::new(cells));
        }
    }

    if rows.is_empty() {
        return docx;
    }
    let docx = docx.add_table(Table::new(rows));
    // Trailing empty paragraph so subsequent blocks don't collapse into the table.
    docx.add_paragraph(empty_paragraph())
}

/// Convert the children of a table cell into DOCX paragraphs. Unlike the
/// previous version, we recognise block kinds (storyboard / figure / list)
/// and flatten them into the cell as a sequence of paragraphs rather than
/// routing them through `paragraph_from_inline` (which would drop their text).
fn build_table_cell(cell_node: &Value) -> TableCell {
    let mut cell = TableCell::new();
    let inner_children = children(cell_node);

    if inner_children.is_empty() {
        return cell.add_paragraph(empty_paragraph());
    }

    let mut any_added = false;
    for inner in inner_children {
        match type_of(&inner) {
            "paragraph" => {
                cell = cell.add_paragraph(paragraph_from_inline(&inner));
                any_added = true;
            }
            "heading" => {
                cell = cell.add_paragraph(heading_paragraph(&inner));
                any_added = true;
            }
            "bulletList" => {
                for p in list_to_paragraphs(&inner, ListKind::Bullet) {
                    cell = cell.add_paragraph(p);
                    any_added = true;
                }
            }
            "orderedList" => {
                for p in list_to_paragraphs(&inner, ListKind::Ordered) {
                    cell = cell.add_paragraph(p);
                    any_added = true;
                }
            }
            "storyboard" => {
                for p in storyboard_to_paragraphs(&inner) {
                    cell = cell.add_paragraph(p);
                    any_added = true;
                }
            }
            "figure" => {
                for p in figure_to_paragraphs(&inner) {
                    cell = cell.add_paragraph(p);
                    any_added = true;
                }
            }
            _ => {
                cell = cell.add_paragraph(fallback_paragraph(&inner));
                any_added = true;
            }
        }
    }

    if !any_added {
        cell = cell.add_paragraph(empty_paragraph());
    }
    cell
}

// ===========================================================================
// Figures

fn render_figure_top(docx: Docx, figure_node: &Value) -> Docx {
    let mut docx = docx;
    for p in figure_to_paragraphs(figure_node) {
        docx = docx.add_paragraph(p);
    }
    docx
}

/// Figures degrade to an italic placeholder + caption. Used both at top level
/// and inside table cells.
fn figure_to_paragraphs(figure_node: &Value) -> Vec<Paragraph> {
    let kind = figure_node
        .get("attrs")
        .and_then(|a| a.get("kind"))
        .and_then(Value::as_str)
        .unwrap_or("image");
    let placeholder_text = match kind {
        "croqui" => "[Croqui — imagem não exportada nesta versão]",
        _ => "[Figura — imagem não exportada nesta versão]",
    };

    let mut out = Vec::new();
    out.push(
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(Run::new().add_text(placeholder_text).italic()),
    );

    // Caption: the only child is figcaption.
    if let Some(figcaption) = figure_node
        .get("content")
        .and_then(Value::as_array)
        .and_then(|arr| {
            arr.iter()
                .find(|c| c.get("type").and_then(Value::as_str) == Some("figcaption"))
        })
    {
        let runs: Vec<Run> = children(figcaption)
            .iter()
            .flat_map(|i| inline_to_runs(i, Some(20), false))
            .collect();
        let mut p = Paragraph::new().align(AlignmentType::Center);
        let mut added = 0;
        for run in runs {
            p = p.add_run(run.italic());
            added += 1;
        }
        if added == 0 {
            p = p.add_run(Run::new().add_text("").italic());
        }
        out.push(p);
    }
    out
}

// ===========================================================================
// Storyboard

fn render_storyboard_top(mut docx: Docx, sb_node: &Value) -> Docx {
    // Caption above
    if let Some(caption) = sb_node
        .get("attrs")
        .and_then(|a| a.get("caption"))
        .and_then(Value::as_str)
    {
        docx = docx.add_paragraph(
            Paragraph::new().add_run(Run::new().add_text(caption).bold().size(22)),
        );
    }

    // One 2-col row per storyboard item: [meta] | [description]
    let items = children(sb_node);
    let mut rows: Vec<TableRow> = Vec::new();
    for item in items {
        rows.push(storyboard_item_to_row(&item));
    }

    if !rows.is_empty() {
        docx = docx.add_table(Table::new(rows));
        docx = docx.add_paragraph(empty_paragraph());
    }
    docx
}

fn storyboard_item_to_row(item: &Value) -> TableRow {
    let timestamp = item
        .get("attrs")
        .and_then(|a| a.get("timestamp"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let frame_label = item
        .get("attrs")
        .and_then(|a| a.get("frame_label"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let meta_cell = TableCell::new()
        .add_paragraph(
            Paragraph::new().add_run(Run::new().add_text("[Frame placeholder]").italic()),
        )
        .add_paragraph(Paragraph::new().add_run(Run::new().add_text(timestamp).bold()))
        .add_paragraph(Paragraph::new().add_run(Run::new().add_text(frame_label)));

    let mut desc_cell = TableCell::new();
    let inner = children(item);
    if inner.is_empty() {
        desc_cell = desc_cell.add_paragraph(empty_paragraph());
    } else {
        for p_node in inner {
            desc_cell = desc_cell.add_paragraph(paragraph_from_inline(&p_node));
        }
    }

    TableRow::new(vec![meta_cell, desc_cell])
}

/// Flatten a storyboard into a sequence of paragraphs (used when the
/// storyboard appears inside a cell — nesting a 2-col table inside a
/// cell makes Word lay things out unpredictably).
fn storyboard_to_paragraphs(sb_node: &Value) -> Vec<Paragraph> {
    let mut out = Vec::new();
    if let Some(caption) = sb_node
        .get("attrs")
        .and_then(|a| a.get("caption"))
        .and_then(Value::as_str)
    {
        out.push(Paragraph::new().add_run(Run::new().add_text(caption).bold()));
    }

    for (idx, item) in children(sb_node).into_iter().enumerate() {
        let timestamp = item
            .get("attrs")
            .and_then(|a| a.get("timestamp"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let frame_label = item
            .get("attrs")
            .and_then(|a| a.get("frame_label"))
            .and_then(Value::as_str)
            .unwrap_or("");

        out.push(
            Paragraph::new().add_run(
                Run::new()
                    .add_text(format!(
                        "Item {} — {} | {}",
                        idx + 1,
                        timestamp,
                        frame_label
                    ))
                    .bold(),
            ),
        );
        for inner in children(&item) {
            out.push(paragraph_from_inline(&inner));
        }
    }
    out
}

// ===========================================================================
// Inline rendering

fn inline_to_runs(node: &Value, base_size: Option<usize>, bold_default: bool) -> Vec<Run> {
    match type_of(node) {
        "text" => vec![text_to_run(node, base_size, bold_default)],
        "hardBreak" => vec![Run::new().add_break(BreakType::TextWrapping)],
        "systemData" => {
            let value = node
                .get("attrs")
                .and_then(|a| a.get("value"))
                .and_then(Value::as_str)
                .unwrap_or("");
            // Distinguish system data with a muted color (gray).
            vec![Run::new().add_text(value).color("808080")]
        }
        _ => Vec::new(),
    }
}

fn text_to_run(node: &Value, base_size: Option<usize>, bold_default: bool) -> Run {
    let text = node.get("text").and_then(Value::as_str).unwrap_or("");
    let mut run = Run::new().add_text(text);
    if let Some(size) = base_size {
        run = run.size(size);
    }
    if bold_default {
        run = run.bold();
    }

    let marks = node
        .get("marks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for mark in marks {
        match mark.get("type").and_then(Value::as_str).unwrap_or("") {
            "bold" => run = run.bold(),
            "italic" => run = run.italic(),
            "underline" => run = run.underline("single"),
            "strike" => run = run.strike(),
            "code" => run = run.fonts(RunFonts::new().east_asia("Consolas").ascii("Consolas")),
            _ => {}
        }
    }
    run
}

// ===========================================================================
// Generic helpers

fn type_of(node: &Value) -> &str {
    node.get("type").and_then(Value::as_str).unwrap_or("")
}

fn children(node: &Value) -> Vec<Value> {
    node.get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn paragraph_alignment(node: &Value) -> Option<AlignmentType> {
    let attr = node
        .get("attrs")
        .and_then(|a| a.get("textAlign"))
        .and_then(Value::as_str)?;
    match attr {
        "center" => Some(AlignmentType::Center),
        "right" => Some(AlignmentType::Right),
        "justify" => Some(AlignmentType::Justified),
        _ => Some(AlignmentType::Left),
    }
}
