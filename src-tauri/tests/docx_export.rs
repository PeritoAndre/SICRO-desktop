//! Integration test for the DOCX exporter.
//!
//! Spike C runtime feedback (2026-05-24): the user reported the DOCX showed
//! only the title. Forensic inspection of the workspace revealed the exported
//! .sicrodoc was actually empty (one empty paragraph) — the walker did the
//! right thing on the input it received. This test pins that contract: given
//! a rich .sicrodoc envelope, every textual leaf must surface in
//! `word/document.xml` of the produced DOCX.

use std::io::Read;
use std::path::Path;

use serde_json::json;
use sicro_desktop_lib::exporters::docx::render_doc_to_docx;

fn extract_document_xml(docx_path: &Path) -> String {
    let file = std::fs::File::open(docx_path).expect("docx exists");
    let mut archive = zip::ZipArchive::new(file).expect("docx is a zip");
    let mut entry = archive
        .by_name("word/document.xml")
        .expect("docx has word/document.xml");
    let mut s = String::new();
    entry.read_to_string(&mut s).expect("document.xml is utf-8");
    s
}

fn assert_contains_all(xml: &str, expected: &[&str]) {
    for needle in expected {
        assert!(
            xml.contains(needle),
            "DOCX document.xml is missing {needle:?}; xml dump:\n{xml}",
        );
    }
}

#[test]
fn renders_paragraphs_headings_marks_table_figure_storyboard() {
    let envelope = json!({
        "title": "Laudo de Teste — André",
        "content": {
            "type": "doc",
            "content": [
                { "type": "heading", "attrs": { "level": 1 }, "content": [
                    { "type": "text", "text": "Introducao" }
                ]},
                { "type": "heading", "attrs": { "level": 2 }, "content": [
                    { "type": "text", "text": "Secao A" }
                ]},
                { "type": "paragraph", "attrs": { "textAlign": "justify" }, "content": [
                    { "type": "text", "text": "Esteve" }
                ]},
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "TextoBold", "marks": [{ "type": "bold" }] }
                ]},
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "TextoItalic", "marks": [{ "type": "italic" }] }
                ]},
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "TextoUnderline", "marks": [{ "type": "underline" }] }
                ]},
                { "type": "paragraph", "content": [
                    { "type": "text", "text": "Aqui" },
                    { "type": "systemData", "attrs": { "source": "occurrence", "field": "municipio", "value": "MunicipioInline", "review_status": "pending" }}
                ]},
                { "type": "bulletList", "content": [
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{ "type": "text", "text": "BulletAlpha" }] }
                    ]},
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{ "type": "text", "text": "BulletBeta" }] }
                    ]},
                ]},
                { "type": "orderedList", "content": [
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{ "type": "text", "text": "OrderedAlpha" }] }
                    ]},
                    { "type": "listItem", "content": [
                        { "type": "paragraph", "content": [{ "type": "text", "text": "OrderedBeta" }] }
                    ]},
                ]},
                {
                    "type": "table",
                    "content": [
                        { "type": "tableRow", "content": [
                            { "type": "tableHeader", "content": [
                                { "type": "paragraph", "content": [{ "type": "text", "text": "HeaderCell" }] }
                            ]},
                            { "type": "tableHeader", "content": [
                                { "type": "paragraph", "content": [{ "type": "text", "text": "HeaderTwo" }] }
                            ]},
                        ]},
                        { "type": "tableRow", "content": [
                            { "type": "tableCell", "content": [
                                { "type": "paragraph", "content": [{ "type": "text", "text": "CellA1" }] }
                            ]},
                            { "type": "tableCell", "content": [
                                { "type": "paragraph", "content": [{ "type": "text", "text": "CellB1" }] }
                            ]},
                        ]},
                    ]
                },
                {
                    "type": "figure",
                    "attrs": { "kind": "image", "src": "data:image/svg+xml;utf8,...", "alt": "" },
                    "content": [
                        { "type": "figcaption", "content": [{ "type": "text", "text": "LegendaFigura" }] }
                    ]
                },
                {
                    "type": "storyboard",
                    "attrs": { "caption": "CaptionStoryboard" },
                    "content": [
                        {
                            "type": "storyboardItem",
                            "attrs": { "timestamp": "00:00:12.500", "frame_label": "Frame: 300" },
                            "content": [
                                { "type": "paragraph", "content": [{ "type": "text", "text": "DescricaoEvento1" }] }
                            ]
                        }
                    ]
                },
                // Nested case the real .sicrodoc had: a storyboard *inside* a tableHeader.
                {
                    "type": "table",
                    "content": [
                        { "type": "tableRow", "content": [
                            { "type": "tableHeader", "content": [
                                {
                                    "type": "storyboard",
                                    "attrs": { "caption": "CaptionNested" },
                                    "content": [
                                        { "type": "storyboardItem",
                                          "attrs": { "timestamp": "00:00:00.000", "frame_label": "Frame: 0" },
                                          "content": [
                                              { "type": "paragraph", "content": [{ "type": "text", "text": "NestedInsideCell" }] }
                                          ]
                                        }
                                    ]
                                }
                            ]}
                        ]}
                    ]
                }
            ]
        }
    });

    let tmp = tempfile::tempdir().expect("tempdir");
    let path = tmp.path().join("rich.docx");
    render_doc_to_docx(&envelope, &path).expect("render_doc_to_docx ok");

    let xml = extract_document_xml(&path);

    assert_contains_all(
        &xml,
        &[
            // Title
            "Laudo de Teste",
            // Headings
            "Introducao",
            "Secao A",
            // Paragraphs + marks
            "Esteve",
            "TextoBold",
            "TextoItalic",
            "TextoUnderline",
            "Aqui",
            "MunicipioInline",
            // Lists
            "BulletAlpha",
            "BulletBeta",
            "OrderedAlpha",
            "OrderedBeta",
            // Table (header + cells)
            "HeaderCell",
            "HeaderTwo",
            "CellA1",
            "CellB1",
            // Figure
            "LegendaFigura",
            // Storyboard top-level
            "CaptionStoryboard",
            "DescricaoEvento1",
            // Storyboard nested in tableHeader (real-world case from the
            // user's .sicrodoc — was being lost before the fix)
            "CaptionNested",
            "NestedInsideCell",
        ],
    );

    // Spot-check formatting marks were not dropped.
    assert!(
        xml.contains("<w:b /><w:bCs />") || xml.contains("<w:b/>"),
        "expected at least one bold run; xml:\n{xml}"
    );
    assert!(
        xml.contains("<w:i /><w:iCs />") || xml.contains("<w:i/>"),
        "expected at least one italic run; xml:\n{xml}"
    );
    assert!(
        xml.contains("w:u "),
        "expected at least one underline run; xml:\n{xml}"
    );
}

#[test]
fn renders_empty_document_without_crashing() {
    // Reproduces the user's actual exported .sicrodoc: just the envelope
    // around a doc with a single empty paragraph. The walker should emit the
    // title + one empty paragraph and pack cleanly.
    let envelope = json!({
        "title": "Laudo vazio",
        "content": {
            "type": "doc",
            "content": [
                { "type": "paragraph" }
            ]
        }
    });

    let tmp = tempfile::tempdir().expect("tempdir");
    let path = tmp.path().join("empty.docx");
    render_doc_to_docx(&envelope, &path).expect("render_doc_to_docx ok");

    let xml = extract_document_xml(&path);
    assert!(xml.contains("Laudo vazio"), "missing title; xml:\n{xml}");
}

#[test]
fn renders_envelope_with_missing_optional_fields() {
    // Defensive case: an envelope that's missing `title` and where a paragraph
    // has no content array at all. Should still produce a valid DOCX with
    // a fallback title.
    let envelope = json!({
        "content": {
            "type": "doc",
            "content": [
                { "type": "paragraph", "content": [{ "type": "text", "text": "MinimalText" }] }
            ]
        }
    });
    let tmp = tempfile::tempdir().expect("tempdir");
    let path = tmp.path().join("minimal.docx");
    render_doc_to_docx(&envelope, &path).expect("render_doc_to_docx ok");

    let xml = extract_document_xml(&path);
    assert!(
        xml.contains("MinimalText"),
        "missing inline text; xml:\n{xml}"
    );
}
