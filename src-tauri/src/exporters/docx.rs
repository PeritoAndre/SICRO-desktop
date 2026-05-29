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
//! MVP 4 — evidência:
//!   - Figures with `attrs.relative_path` are embedded as real PNG/JPEG via
//!     docx-rs `Pic`. The asset bytes are read from `<workspace>/<rel>` so
//!     `Word`/LibreOffice see actual images, not placeholders. When the file
//!     is missing, unreadable, or the workspace root wasn't provided (e.g.
//!     unit tests), we fall back to the original italic placeholder so the
//!     pipeline never crashes mid-export.
//!   - Storyboard items behave the same way — frames extracted by Spike F
//!     show as inline images.
//!   - The new `evidenceTable` node from the schema is rendered as a real
//!     DOCX table (title + thead + tbody) so checklist / vestígios /
//!     medições keep their structure.

use std::path::Path;

use docx_rs::*;
use serde_json::Value;

use crate::error::{Result, SicroError};

/// Render the TipTap JSON `content` (the inner value of `.sicrodoc`'s
/// `content` field) into a DOCX file at `target`.
///
/// `workspace_root` is the absolute path of the `.sicro` folder. When
/// provided, figures and storyboard items with a `relative_path` attribute
/// are embedded as real images. Passing `None` is supported (used by the
/// unit tests) — in that mode every image degrades to the italic
/// placeholder.
pub fn render_doc_to_docx(
    envelope: &Value,
    target: &Path,
    workspace_root: Option<&Path>,
) -> Result<()> {
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

    // N11 — Header dinâmico Word-style. Se envelope.header existir,
    // estiver enabled e tiver conteúdo não-vazio, monta um Header DOCX
    // nativo iterando os blocos do ProseMirror.
    if let Some(header) = build_dynamic_header(envelope) {
        docx = docx.header(header);
    }

    // Apply effective page margins. The resolution order matches the editor:
    //   envelope.layout.page.margins  >  institutional template default  >  SICRO default.
    docx = docx.page_margin(resolve_page_margin(envelope, template_id));

    docx = docx.add_paragraph(title_paragraph(&title));

    let ctx = RenderCtx { workspace_root };
    for node in &blocks {
        docx = render_top_level_block(docx, node, &ctx);
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

/// Carries the read-only state needed during the walk so each node can
/// resolve evidence assets without re-parsing the envelope.
#[derive(Clone, Copy)]
struct RenderCtx<'a> {
    workspace_root: Option<&'a Path>,
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
// N — Institutional chrome (footer apenas; header agora é dinâmico)
//
// Header hardcoded REMOVIDO. Antes essa seção injetava 3 linhas fixas
// (GOVERNO DO ESTADO DO AMAPÁ / POLÍCIA CIENTÍFICA / DEPTO CRIMINALÍSTICA)
// + "Laudo nº" no Header nativo do DOCX. Em N11 será reintroduzida a
// injeção de Header LENDO `envelope.header.content` (ProseMirror JSON),
// percorrendo os nodes com a mesma máquina do walker do body, e só quando
// `envelope.header.enabled === true`.
//
// O Footer permanece como antes — N só refatora o header.
// Marca lateral continua intencionalmente fora do DOCX (texto rotacionado
// em margem é frágil entre Word desktop / LibreOffice / Office Mobile).

fn build_institutional_chrome(
    docx: Docx,
    template_id: Option<&str>,
    metadata: Option<&serde_json::Map<String, Value>>,
) -> Docx {
    // N — `template_id` e `metadata` deixam de alimentar o header hardcoded
    // mas seguem disponíveis para o footer (e para futuras políticas
    // dependentes de template). Marcamos como consumidos para o compilador.
    let _ = template_id;
    let _ = metadata;

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

    // N — Header NÃO é mais aplicado aqui. É construído por
    // `build_dynamic_header` (N11) e aplicado no caller a partir do
    // `envelope.header.content`.
    docx.footer(footer)
}

/// N11 — Constrói um Header DOCX nativo a partir do envelope.header.
///
/// Retorna `None` quando:
///   - envelope não tem campo `header`,
///   - `header.enabled === false`,
///   - `header.content` está vazio (só parágrafo vazio).
///
/// Caso contrário monta um `Header::new()` iterando os blocos
/// top-level do `header.content.content` e convertendo cada um em
/// `Paragraph` via as MESMAS funções usadas no walker do body
/// (`paragraph_from_inline`, `heading_paragraph`). Isso garante que
/// formatação inline (bold/italic/underline/cor/alinhamento) seja
/// preservada com a mesma fidelidade.
///
/// Limitações conhecidas (alpha): nodes complexos como Figure, Storyboard,
/// EvidenceTable, Quesito não são suportados no header — apenas
/// paragraph/heading. Imagens inline via Image node são embedadas como
/// placeholder italic (mesmo fallback do body para imagens não
/// resolvíveis).
fn build_dynamic_header(envelope: &Value) -> Option<Header> {
    let header_node = envelope.get("header")?;
    let enabled = header_node
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !enabled {
        return None;
    }
    let content_doc = header_node.get("content")?;
    let blocks = children(content_doc);
    if blocks.is_empty() {
        return None;
    }
    // Detecta header "trivialmente vazio" (apenas 1 parágrafo sem texto).
    if blocks.len() == 1
        && type_of(&blocks[0]) == "paragraph"
        && children(&blocks[0]).is_empty()
    {
        return None;
    }

    let mut header = Header::new();
    for node in &blocks {
        match type_of(node) {
            "paragraph" => {
                header = header.add_paragraph(paragraph_from_inline(node));
            }
            "heading" => {
                header = header.add_paragraph(heading_paragraph(node));
            }
            // Fallback: trata qualquer outro top-level como parágrafo
            // (extrai texto recursivamente). Mantém o header útil mesmo
            // se aparecerem nodes inesperados de schemas futuros.
            _ => {
                header = header.add_paragraph(fallback_paragraph(node));
            }
        }
    }
    Some(header)
}

// ===========================================================================
// Block dispatch (top level)

fn render_top_level_block(docx: Docx, node: &Value, ctx: &RenderCtx) -> Docx {
    match type_of(node) {
        "paragraph" => docx.add_paragraph(paragraph_from_inline(node)),
        "heading" => docx.add_paragraph(heading_paragraph(node)),
        "bulletList" => render_list(docx, node, ListKind::Bullet),
        "orderedList" => render_list(docx, node, ListKind::Ordered),
        "table" => render_table(docx, node, ctx),
        "figure" => render_figure_top(docx, node, ctx),
        "storyboard" => render_storyboard_top(docx, node, ctx),
        // MVP 4 — checklist/vestígios/medições importadas do Dossiê.
        "evidenceTable" => render_evidence_table(docx, node),
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

fn render_table(docx: Docx, table_node: &Value, ctx: &RenderCtx) -> Docx {
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
            cells.push(build_table_cell(cell_node, ctx));
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
fn build_table_cell(cell_node: &Value, ctx: &RenderCtx) -> TableCell {
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
                for p in storyboard_to_paragraphs(&inner, ctx) {
                    cell = cell.add_paragraph(p);
                    any_added = true;
                }
            }
            "figure" => {
                for p in figure_to_paragraphs(&inner, ctx) {
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

fn render_figure_top(docx: Docx, figure_node: &Value, ctx: &RenderCtx) -> Docx {
    let mut docx = docx;
    for p in figure_to_paragraphs(figure_node, ctx) {
        docx = docx.add_paragraph(p);
    }
    docx
}

/// Figures embed the real PNG/JPEG when possible (MVP 4) and fall back to
/// an italic placeholder otherwise. The placeholder mirrors Spike C
/// behaviour so older `.sicrodoc` files without `relative_path` keep
/// working.
fn figure_to_paragraphs(figure_node: &Value, ctx: &RenderCtx) -> Vec<Paragraph> {
    let attrs = figure_node.get("attrs");
    let kind = attrs
        .and_then(|a| a.get("kind"))
        .and_then(Value::as_str)
        .unwrap_or("image");
    let relative_path = attrs
        .and_then(|a| a.get("relative_path"))
        .and_then(Value::as_str);

    let mut out = Vec::new();

    // Try to embed the actual image, fall back to an italic placeholder.
    let mut embedded = false;
    if let (Some(ws), Some(rel)) = (ctx.workspace_root, relative_path) {
        if let Some(pic) = build_image_pic(ws, rel) {
            out.push(
                Paragraph::new()
                    .align(AlignmentType::Center)
                    .add_run(Run::new().add_image(pic)),
            );
            embedded = true;
        }
    }
    if !embedded {
        let placeholder_text = match kind {
            "croqui" => "[Croqui — imagem indisponível nesta exportação]",
            "video_frame" => "[Frame de vídeo — imagem indisponível nesta exportação]",
            _ => "[Figura — imagem indisponível nesta exportação]",
        };
        out.push(
            Paragraph::new()
                .align(AlignmentType::Center)
                .add_run(Run::new().add_text(placeholder_text).italic()),
        );
    }

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

fn render_storyboard_top(mut docx: Docx, sb_node: &Value, ctx: &RenderCtx) -> Docx {
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
        rows.push(storyboard_item_to_row(&item, ctx));
    }

    if !rows.is_empty() {
        docx = docx.add_table(Table::new(rows));
        docx = docx.add_paragraph(empty_paragraph());
    }
    docx
}

fn storyboard_item_to_row(item: &Value, ctx: &RenderCtx) -> TableRow {
    let attrs = item.get("attrs");
    let timestamp = attrs
        .and_then(|a| a.get("timestamp"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let frame_label = attrs
        .and_then(|a| a.get("frame_label"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let relative_path = attrs
        .and_then(|a| a.get("relative_path"))
        .and_then(Value::as_str);

    // Image cell (left) — embed the actual frame if we have it, otherwise
    // fall back to a placeholder. Storyboard frames target a smaller width
    // (about 7 cm) so two columns still fit comfortably on the page.
    let mut meta_cell = TableCell::new();
    let mut image_paragraph_added = false;
    if let (Some(ws), Some(rel)) = (ctx.workspace_root, relative_path) {
        if let Some(pic) = build_storyboard_pic(ws, rel) {
            meta_cell = meta_cell.add_paragraph(
                Paragraph::new()
                    .align(AlignmentType::Center)
                    .add_run(Run::new().add_image(pic)),
            );
            image_paragraph_added = true;
        }
    }
    if !image_paragraph_added {
        meta_cell = meta_cell.add_paragraph(
            Paragraph::new().add_run(Run::new().add_text("[Frame indisponível]").italic()),
        );
    }
    meta_cell = meta_cell
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
// MVP 4 — evidenceTable (checklist / vestígios / medições)

fn render_evidence_table(mut docx: Docx, node: &Value) -> Docx {
    let attrs = node.get("attrs");
    let title = attrs
        .and_then(|a| a.get("title"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let columns: Vec<(String, String)> = attrs
        .and_then(|a| a.get("columns"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    let key = c.get("key").and_then(Value::as_str)?.to_string();
                    let label = c
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    Some((key, label))
                })
                .collect()
        })
        .unwrap_or_default();
    let rows: Vec<&Value> = attrs
        .and_then(|a| a.get("rows"))
        .and_then(Value::as_array)
        .map(|v| v.iter().collect())
        .unwrap_or_default();

    if columns.is_empty() {
        return docx;
    }

    if !title.trim().is_empty() {
        docx = docx.add_paragraph(
            Paragraph::new()
                .add_run(Run::new().add_text(title.clone()).bold().size(22)),
        );
    }

    // Header row
    let header_cells: Vec<TableCell> = columns
        .iter()
        .map(|(_, label)| {
            TableCell::new().add_paragraph(
                Paragraph::new()
                    .add_run(Run::new().add_text(label.clone()).bold()),
            )
        })
        .collect();

    let mut table_rows: Vec<TableRow> = Vec::new();
    table_rows.push(TableRow::new(header_cells));

    for row in rows {
        let cells: Vec<TableCell> = columns
            .iter()
            .map(|(key, _)| {
                let text = match row.get(key) {
                    Some(Value::String(s)) => s.clone(),
                    Some(Value::Number(n)) => n.to_string(),
                    Some(Value::Bool(b)) => b.to_string(),
                    Some(Value::Null) | None => "—".to_string(),
                    Some(other) => other.to_string(),
                };
                TableCell::new()
                    .add_paragraph(Paragraph::new().add_run(Run::new().add_text(text)))
            })
            .collect();
        table_rows.push(TableRow::new(cells));
    }

    docx = docx.add_table(Table::new(table_rows));
    docx.add_paragraph(empty_paragraph())
}

// ===========================================================================
// MVP 4 — Image embedding helpers

/// Default body content width when fitting an embedded figure. ~14 cm fits
/// inside the PCA Padrão page geometry (A4, 3 cm top, 3.5 cm left, 2 cm
/// right ⇒ ~15.5 cm of usable width) with a small visual breathing room.
const FIGURE_TARGET_WIDTH_CM: f64 = 14.0;
const STORYBOARD_TARGET_WIDTH_CM: f64 = 7.0;
/// 1 cm in English Metric Units (docx-rs measures images in EMU).
const EMU_PER_CM: f64 = 360_000.0;

fn build_image_pic(workspace_root: &Path, relative_path: &str) -> Option<Pic> {
    resolve_image_bytes(workspace_root, relative_path).and_then(|bytes| {
        let (w_emu, h_emu) = image_target_emu(&bytes, FIGURE_TARGET_WIDTH_CM);
        Some(Pic::new(&bytes).size(w_emu, h_emu))
    })
}

fn build_storyboard_pic(workspace_root: &Path, relative_path: &str) -> Option<Pic> {
    resolve_image_bytes(workspace_root, relative_path).and_then(|bytes| {
        let (w_emu, h_emu) = image_target_emu(&bytes, STORYBOARD_TARGET_WIDTH_CM);
        Some(Pic::new(&bytes).size(w_emu, h_emu))
    })
}

/// Read the bytes of an evidence asset, refusing path traversal. Returns
/// `None` for missing / unreadable / non-image files — the caller is
/// expected to fall back to a placeholder.
fn resolve_image_bytes(workspace_root: &Path, rel: &str) -> Option<Vec<u8>> {
    let safe = sanitize_relative_path(rel)?;
    let abs = workspace_root.join(&safe);
    let bytes = std::fs::read(&abs).ok()?;
    if !is_supported_image(&bytes) {
        return None;
    }
    Some(bytes)
}

fn sanitize_relative_path(raw: &str) -> Option<std::path::PathBuf> {
    if raw.is_empty() {
        return None;
    }
    if raw.starts_with('/') || raw.starts_with('\\') {
        return None;
    }
    if let Some(c) = raw.chars().next() {
        if c.is_alphabetic() && raw[1..].starts_with(':') {
            return None;
        }
    }
    let mut out = std::path::PathBuf::new();
    for part in raw.split(['/', '\\']) {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return None;
        }
        out.push(part);
    }
    Some(out)
}

fn is_supported_image(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A])
        || bytes.starts_with(&[0xFF, 0xD8, 0xFF])
}

/// Decide the docx-rs `size(width, height)` parameters for an image. The
/// width is fixed (`target_cm`); the height is derived from the file's
/// intrinsic aspect ratio so figures stay un-stretched. When the file
/// dimensions can't be parsed we fall back to a 4:3 aspect.
fn image_target_emu(bytes: &[u8], target_cm: f64) -> (u32, u32) {
    let (width_px, height_px) =
        image_dimensions(bytes).unwrap_or((4, 3)); // fallback ratio
    let aspect = if width_px == 0 {
        0.75
    } else {
        height_px as f64 / width_px as f64
    };
    let width_cm = target_cm.max(1.0);
    let height_cm = (width_cm * aspect).clamp(1.0, 18.0);
    let w = (width_cm * EMU_PER_CM).round() as u32;
    let h = (height_cm * EMU_PER_CM).round() as u32;
    (w, h)
}

/// Parse PNG / JPEG image dimensions. Returns `None` for unsupported or
/// truncated files. We deliberately stay free of `image`/`imagesize`
/// dependencies — the PNG IHDR and JPEG SOF segments are tiny.
fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        // PNG: 8-byte signature + 4 length + 4 type "IHDR" + 4 width + 4 height
        if bytes.len() < 24 {
            return None;
        }
        let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
        return Some((w, h));
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        // Walk JPEG markers until we hit an SOFn (start of frame) segment.
        let mut i = 2usize;
        while i + 9 < bytes.len() {
            // Marker must start with 0xFF; skip padding 0xFFs.
            if bytes[i] != 0xFF {
                return None;
            }
            while i < bytes.len() && bytes[i] == 0xFF {
                i += 1;
            }
            if i >= bytes.len() {
                return None;
            }
            let marker = bytes[i];
            i += 1;
            // Standalone markers (no segment body).
            if marker == 0xD8 || marker == 0xD9 || (0xD0..=0xD7).contains(&marker) {
                continue;
            }
            if i + 1 >= bytes.len() {
                return None;
            }
            let seg_len = u16::from_be_bytes([bytes[i], bytes[i + 1]]) as usize;
            if seg_len < 2 || i + seg_len > bytes.len() {
                return None;
            }
            // SOFn = 0xC0..=0xCF excluding 0xC4 (DHT), 0xC8 (JPG), 0xCC (DAC).
            if (0xC0..=0xCF).contains(&marker)
                && marker != 0xC4
                && marker != 0xC8
                && marker != 0xCC
            {
                if i + 7 >= bytes.len() {
                    return None;
                }
                // i points to seg_len (2 bytes); after that is precision (1),
                // then height (2 BE), then width (2 BE).
                let h = u16::from_be_bytes([bytes[i + 3], bytes[i + 4]]) as u32;
                let w = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32;
                return Some((w, h));
            }
            i += seg_len;
        }
        return None;
    }
    None
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
fn storyboard_to_paragraphs(sb_node: &Value, ctx: &RenderCtx) -> Vec<Paragraph> {
    let mut out = Vec::new();
    if let Some(caption) = sb_node
        .get("attrs")
        .and_then(|a| a.get("caption"))
        .and_then(Value::as_str)
    {
        out.push(Paragraph::new().add_run(Run::new().add_text(caption).bold()));
    }

    for (idx, item) in children(sb_node).into_iter().enumerate() {
        let attrs = item.get("attrs");
        let timestamp = attrs
            .and_then(|a| a.get("timestamp"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let frame_label = attrs
            .and_then(|a| a.get("frame_label"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let relative_path = attrs
            .and_then(|a| a.get("relative_path"))
            .and_then(Value::as_str);

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

        // Best-effort: embed the actual frame even when nested in a cell.
        if let (Some(ws), Some(rel)) = (ctx.workspace_root, relative_path) {
            if let Some(pic) = build_storyboard_pic(ws, rel) {
                out.push(
                    Paragraph::new()
                        .align(AlignmentType::Center)
                        .add_run(Run::new().add_image(pic)),
                );
            }
        }

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
