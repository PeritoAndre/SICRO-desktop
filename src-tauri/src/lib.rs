//! SICRO Desktop — library crate.
//!
//! The Tauri entry point in `main.rs` re-exports `run()` from this crate.
//! Splitting library from binary lets us run unit tests against modules
//! without dragging the Tauri runtime into the test harness.

pub mod commands;
pub mod database;
pub mod error;
pub mod exporters;
pub mod filesystem;
pub mod hashing;
pub mod importer;
pub mod models;
pub mod state;
pub mod video;
pub mod workspace;

use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(false)
        .init();

    let app_state = state::AppState::init().expect("failed to initialize AppState");

    // NOTE: `generate_handler!` needs the full path to the module that owns the
    // `#[tauri::command]` annotation. The macro generates sibling symbols
    // (`__cmd__*`, `__tauri_command_name_*`) next to the function, and those
    // siblings are not carried over by a `pub use` re-export.
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // workspace / occurrence
            commands::workspace_commands::create_occurrence,
            commands::workspace_commands::open_occurrence,
            commands::workspace_commands::get_occurrence,
            commands::workspace_commands::list_recent_occurrences,
            commands::workspace_commands::forget_recent_occurrence,
            // laudo (Spike B)
            commands::laudo_commands::create_laudo,
            commands::laudo_commands::list_laudos,
            commands::laudo_commands::read_laudo,
            commands::laudo_commands::save_laudo,
            // export (Spike C)
            commands::export_commands::export_laudo_html,
            commands::export_commands::export_laudo_pdf,
            commands::export_commands::export_laudo_docx,
            commands::export_commands::list_laudo_exports,
            // importer (Spike D — .sicroapp)
            commands::import_commands::import_sicroapp,
            commands::import_commands::list_workspace_imports,
            commands::import_commands::read_import_report,
            commands::import_commands::list_workspace_photos,
            // dossiê operacional (MVP 3)
            commands::dossie_commands::get_dossie_summary,
            commands::dossie_commands::list_dossie_photos,
            commands::dossie_commands::list_dossie_checklist,
            commands::dossie_commands::list_dossie_entities,
            commands::dossie_commands::list_dossie_traces,
            commands::dossie_commands::list_dossie_measurements,
            commands::dossie_commands::list_dossie_notes,
            commands::dossie_commands::list_dossie_timeline,
            commands::dossie_commands::get_dossie_stats,
            commands::dossie_commands::rehydrate_dossie,
            // croqui (Spike E)
            commands::croqui_commands::create_croqui,
            commands::croqui_commands::list_croquis,
            commands::croqui_commands::read_croqui,
            commands::croqui_commands::save_croqui,
            commands::croqui_commands::export_croqui_png,
            // video (Spike F)
            commands::video_commands::register_video_media,
            commands::video_commands::list_video_media,
            commands::video_commands::open_video_media,
            commands::video_commands::create_video_event,
            commands::video_commands::update_video_event,
            commands::video_commands::delete_video_event,
            commands::video_commands::collect_video_frame,
            commands::video_commands::update_storyboard_frame,
            commands::video_commands::delete_storyboard_frame,
            commands::video_commands::list_video_operation_logs,
            // evidência → laudo (MVP 4)
            commands::evidence_commands::record_evidence_link,
            commands::evidence_commands::list_evidence_links_for_laudo,
            commands::evidence_commands::read_evidence_asset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SICRO Desktop");
}
