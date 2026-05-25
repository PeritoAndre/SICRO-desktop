//! Tauri command surface — anything callable from JavaScript lives here.
//!
//! We deliberately do NOT `pub use` the individual `#[tauri::command]` items
//! at this level. The `tauri::generate_handler!` macro relies on macro-generated
//! sibling symbols (`__cmd__*`) which live next to the function in
//! `workspace_commands`; a `pub use` would silently shadow that path and break
//! the handler registration. Always reference commands via their full module
//! path: `commands::workspace_commands::<name>`.

pub mod workspace_commands;
