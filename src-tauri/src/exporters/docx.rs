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
//! MVP 2 ajuste runtime 1.2:
//!   - Page margins are read from `envelope.layout.page.margins` (the same
//!     resolver used by the editor and the HTML/PDF renderer). When the
//!     envelope does not carry a per-laudo override, the institutional
//!     template default is applied. Values in cm are converted to twips
//!     (1 cm = 567 twips) for docx-rs `PageMargin`.
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

    // MVP 2: register institutional Header/Footer (best-effort).
    let template_id = envelope
        .get("layout")
        .and_then(|l| l.get("institutional_template"))
        .and_then(Value::as_str);
    let metadata = envelope
        .get("metadata")
        .and_then(Value::as_object)
        .cloned();

    let mut docx = build_institutional_chrome(Docx::new(), template_id, metadata.as_ref());

    // Apply effective page margins. The resolution order matches the editor:
    //   envelope.layout.page.margins  >  institutional template default  >  SICRO default.
    docx = docx.page_margin(resolve_page_margin(envelope, template_id));

    docx = docx.add_paragraph(title_paragraph(&title));

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
// MVP 2 ajuste 1.2 — page margins

/// 1 cm in twentieths of a point (twips). Word page geometry is expressed in
/// twips, so this conversion is exact for the values we accept.
const TWIPS_PER_CM: f64 = 567.0;

fn cm_to_twips(cm: f64) -> i32 {
    (cm * TWIPS_PER_CM).round() as i32
}

/// Parse a CSS length string ("3cm", "2.5cm", "25mm", "30pt", "1in").
/// Defaults: bare numbers are interpreted as cm. Returns None for invalid input.
fn parse_length_cm(value: &str) -> Option<f64> {
    let trimmed = value.trim().replace(',', ".");
    if trimmed.is_empty() {
        return None;
    }
    // Find the unit suffix.
    let (num_part, unit) = trimmed
        .find(|c: char| c.is_alphabetic())
        .map(|idx| (&trimmed[..idx], &trimmed[idx..]))
        .unwrap_or((trimmed.as_str(), "cm"));
    let n: f64 = num_part.trim().parse().ok()?;
    let cm = match unit.trim().to_lowercase().as_str() {
        "cm" | "" => n,
        "mm" => n / 10.0,
        "pt" => n / 28.3464567,
        "in" => n * 2.54,
        "px" => n / 37.795275591, // 96 dpi
        _ => return None,
    };
    Some(cm)
}

/// Resolve effective margins from envelope.layout.page.margins or fall back to
/// the institutional template defaults. Keeps the DOCX consistent with the
/// editor and the HTML/PDF renderer.
fn resolve_page_margin(envelope: &Value, template_id: Option<&str>) -> PageMargin {
    // Template fallback (cm). Mirrors `institutional-templates.ts`.
    let (mut top, mut right, mut bottom, mut left) = match template_id.unwrap_or("pca_padrao_v1")
    {
        "pca_padrao_v1" => (3.0_f64, 2.0_f64, 2.5_f64, 3.5_f64),
        _ => (2.5_f64, 2.5_f64, 2.5_f64, 2.5_f64),
    };

    // Per-laudo override (envelope.layout.page.margins) takes precedence when
    // the four sides are present and parse cleanly.
    if let Some(m) = envelope
        .get("layout")
        .and_then(|l| l.get("page"))
        .and_then(|p| p.get("margins"))
    {
        let parsed = (
            m.get("top").and_then(Value::as_str).and_then(parse_length_cm),
            m.get("right").and_then(Value::as_str).and_then(parse_length_cm),
            m.get("bottom").and_then(Value::as_str).and_then(parse_length_cm),
            m.get("left").and_then(Value::as_str).and_then(parse_length_cm),
        );
        if let (Some(t), Some(r), Some(b), Some(l)) = parsed {
            top = t;
            right = r;
            bottom = b;
            left = l;
        }
    }

    PageMargin::new()
        .top(cm_to_twips(top))
        .right(cm_to_twips(right))
        .bottom(cm_to_twips(bottom))
        .left(cm_to_twips(left))
}

// ===========================================================================
// MVP 2 — institutional chrome (header / footer)

/// Apply Header + Footer to the docx based on the institutional template id.
/// Marca lateral é intencionalmente omitida no DOCX (texto rotacionado em
/// margem é frágil entre Word desktop / LibreOffice / Office Mobile;
/// preferimos pular a representar mal).
fn build_institutional_chrome(
    docx: Docx,
    template_id: Option<&str>,
    metadata: Option<&serde_json::Map<String, Value>>,
) -> Docx {
    // Spike B did not set `institutional_template`; we default to PCA padrão.
    let id = template_id.unwrap_or("pca_padrao_v1");
    match id {
        "pca_padrao_v1" => pca_padrao_v1_chrome(docx, metadata),
        _ => docx,
    }
}

fn pca_padrao_v1_chrome(
    docx: Docx,
    metadata: Option<&serde_json::Map<String, Value>>,
) -> Docx {
    let brand_lines = [
        "GOVERNO DO ESTADO DO AMAPÁ",
        "POLÍCIA CIENTÍFICA DO AMAPÁ",
        "DEPARTAMENTO DE CRIMINALÍSTICA",
    ];

    let mut header = Header::new();
    for line in brand_lines.iter() {
        header = header.add_paragraph(
            Paragraph::new()
                .align(AlignmentType::Center)
                .add_run(Run::new().add_text(*line).bold().size(20)),
        );
    }

    // Single optional line with "Laudo nº" if present in metadata.
    if let Some(numero) = metadata
        .and_then(|m| m.get("numero_laudo"))
        .and_then(Value::as_str)
    {
        if !numero.trim().is_empty() {
            header = header.add_paragraph(
                Paragraph::new()
                    .align(AlignmentType::Right)
                    .add_run(
                        Run::new()
                            .add_text(format!("Laudo nº {}", numero))
                            .size(18),
                    ),
            );
        }
    }

    let footer = Footer::new().add_paragraph(
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(
                Run::new()
                    .add_text("Documento gerado pelo SICRO 2.0 — versão preliminar (MVP 2).")
                    .size(16)
                    .italic(),
            ),
    );

    docx.header(header).footer(footer)
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
        // MVP 2 — institutional blocks
        "quesitoList" => render_quesito_list(docx, node),
        "signature" => render_signature(docx, node),
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
            "quesitoList" => {
                for p in quesito_list_to_paragraphs(&inner) {
                    cell = cell.add_paragraph(p);
                    any_added = true;
                }
            }
            "signature" => {
                for p in signature_to_paragraphs(&inner) {
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

// ===========================================================================
// Quesito (MVP 2)

fn render_quesito_list(mut docx: Docx, list_node: &Value) -> Docx {
    for p in quesito_list_to_paragraphs(list_node) {
        docx = docx.add_paragraph(p);
    }
    docx
}

fn quesito_list_to_paragraphs(list_node: &Value) -> Vec<Paragraph> {
    let mut out = Vec::new();
    for (idx, item) in children(list_node).into_iter().enumerate() {
        let mut question = String::new();
        let mut answer = String::new();
        for child in children(&item) {
            match type_of(&child) {
                "quesitoQuestion" => collect_text(&child, &mut question),
                "quesitoAnswer" => collect_text(&child, &mut answer),
                _ => {}
            }
        }

        // "Quesito N: <pergunta>"
        let mut q = Paragraph::new().align(AlignmentType::Justified);
        q = q.add_run(
            Run::new()
                .add_text(format!("Quesito {}: ", idx + 1))
                .bold(),
        );
        if question.trim().is_empty() {
            q = q.add_run(Run::new().add_text("(sem pergunta)"));
        } else {
            q = q.add_run(Run::new().add_text(question));
        }
        out.push(q);

        // "Resposta: <resposta>"
        let mut a = Paragraph::new()
            .align(AlignmentType::Justified)
            .indent(Some(360), None, None, None);
        a = a.add_run(Run::new().add_text("Resposta: ").bold());
        if answer.trim().is_empty() {
            a = a.add_run(Run::new().add_text("(a preencher)").italic());
        } else {
            a = a.add_run(Run::new().add_text(answer));
        }
        out.push(a);

        // Spacer
        out.push(empty_paragraph());
    }
    out
}

// ===========================================================================
// Signature (MVP 2)

fn render_signature(mut docx: Docx, sig_node: &Value) -> Docx {
    for p in signature_to_paragraphs(sig_node) {
        docx = docx.add_paragraph(p);
    }
    docx
}

fn signature_to_paragraphs(sig_node: &Value) -> Vec<Paragraph> {
    let attrs = sig_node.get("attrs");
    let city = attrs
        .and_then(|a| a.get("city"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let uf = attrs
        .and_then(|a| a.get("uf"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let date = attrs
        .and_then(|a| a.get("date"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let name = attrs
        .and_then(|a| a.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let role = attrs
        .and_then(|a| a.get("role"))
        .and_then(Value::as_str)
        .unwrap_or("Perito Criminal");

    let place_line = if !city.is_empty() || !uf.is_empty() {
        format!("{} - {}, {}.", city, uf, format_pt_br_date(date))
    } else {
        format_pt_br_date(date)
    };

    vec![
        // empty spacer
        empty_paragraph(),
        // Place + date — right-aligned per institutional convention
        Paragraph::new()
            .align(AlignmentType::Right)
            .add_run(Run::new().add_text(place_line)),
        // Blank line for the signature
        empty_paragraph(),
        // Rule
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(Run::new().add_text("_______________________________")),
        // Name (bold, centered)
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(Run::new().add_text(if name.is_empty() {
                "(nome do perito)".to_string()
            } else {
                name.to_string()
            }).bold()),
        // Role (italic, centered)
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(Run::new().add_text(role).italic()),
    ]
}

fn format_pt_br_date(iso: &str) -> String {
    // Accept "YYYY-MM-DD" or full ISO; output "DD/MM/YYYY". Empty input
    // returns a blank placeholder.
    if iso.is_empty() {
        return "______ / ______ / ______".to_string();
    }
    if iso.len() < 10 {
        return iso.to_string();
    }
    let date_part = &iso[..10];
    let parts: Vec<&str> = date_part.split('-').collect();
    if parts.len() != 3 {
        return date_part.to_string();
    }
    format!("{}/{}/{}", parts[2], parts[1], parts[0])
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
