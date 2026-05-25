//! Serializable domain models that cross the Tauri boundary.
//!
//! These structs mirror `src/types/*.ts` on the front-end. Keep field names
//! in snake_case — serde defaults match the TypeScript wire format.

pub mod croqui;
pub mod dossie;
pub mod export;
pub mod import;
pub mod laudo;
pub mod occurrence;

pub use croqui::{Croqui, CroquiDoc, CroquiStatus, ExportCroquiPngInput, NewCroquiInput};
pub use dossie::{
    ChecklistItem, ChecklistSummary, DossieCounts, DossieSummary, Entity, FieldNote, Measurement,
    OccurrenceStats, RehydrateOutcome, TimelineEvent, Trace,
};
pub use export::{Export, ExportKind};
pub use import::{
    EvidenceItem, HashMismatch, Import, ImportReport, ImportResult, ImportSicroappInput,
    ImportStatus, MediaAsset, MediaAssetType,
};
pub use laudo::{Laudo, LaudoDoc, LaudoStatus, NewLaudoInput};
pub use occurrence::{
    LoadedOccurrence, NewOccurrenceInput, Occurrence, OccurrenceStatus, RecentOccurrence,
};
