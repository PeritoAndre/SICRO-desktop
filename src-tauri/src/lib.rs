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
        ])
        .run(tauri::generate_context!())
        .expect("error while running SICRO Desktop");
}
