/**
 * Mirror of `src-tauri/src/workspace/{backup,health}.rs` and
 * `src-tauri/src/commands/alpha_commands.rs` (MVP 8 — Consolidação Alpha).
 */

export interface BackupArtifact {
  absolute_path: string;
  relative_path: string;
  filename: string;
  size_bytes: number;
  hash_sha256: string;
  file_count: number;
  created_at: string;
}

export interface DependencyStatus {
  name: string;
  found: boolean;
  path: string | null;
  version_hint: string | null;
}

export interface WorkspaceCounters {
  photos: number;
  laudos: number;
  croquis: number;
  croqui_exports: number;
  videos: number;
  storyboard_frames: number;
  image_analyses: number;
  image_exports: number;
  laudo_exports: number;
  evidence_links: number;
}

export interface WorkspaceHealth {
  workspace_path: string;
  workspace_id: string;
  occurrence_id: string;
  workspace_size_bytes: number;
  counters: WorkspaceCounters;
  /** "ok" | "warning" | "critical" */
  integrity_overall_status: string;
  files_ok: number;
  files_missing: number;
  broken_links: number;
  unsafe_paths: number;
}

export interface SystemHealthSnapshot {
  generated_at: string;
  app_version: string;
  schema_migrations_applied: number;
  dependencies: DependencyStatus[];
  workspace: WorkspaceHealth | null;
  warnings: string[];
}

export interface HealthReportArtifact {
  relative_path: string;
  generated_at: string;
  overall_status: string;
}
