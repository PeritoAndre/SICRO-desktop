//! Editor de Imagem Pericial (MVP 7) — módulo central.
//!
//! Estrutura:
//!   - `processor`  → operações reais sobre bytes (image crate);
//!   - `pipeline`   → orquestra leitura → ajustes → operações → escrita,
//!                    com sidecar JSON + hash final;
//!   - `metadata`   → leitura de metadados (dimensões, mime, hash) sem
//!                    decodificar a imagem inteira quando possível.
//!
//! Nenhum commando Tauri vive aqui — esses ficam em
//! `crate::commands::image_commands`, que apenas orquestra
//! `image_analysis_repo` + chamada do `pipeline`.

pub mod metadata;
pub mod pipeline;
pub mod processor;
