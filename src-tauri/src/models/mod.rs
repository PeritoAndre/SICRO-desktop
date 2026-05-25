//! Serializable domain models that cross the Tauri boundary.
//!
//! These structs mirror `src/types/*.ts` on the front-end. Keep field names
//! in snake_case — serde defaults match the TypeScript wire format.

pub mod export;
pub mod laudo;
pub mod occurrence;

pub use export::{Export, ExportKind};
pub use laudo::{Laudo, LaudoDoc, LaudoStatus, NewLaudoInput};
pub use occurrence::{
    LoadedOccurrence, NewOccurrenceInput, Occurrence, OccurrenceStatus, RecentOccurrence,
};
