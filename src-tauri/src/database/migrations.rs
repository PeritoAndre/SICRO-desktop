//! Schema migrations.
//!
//! Migrations are bundled at compile time via `include_str!`, so they ship
//! inside the executable. Versions are tracked in `schema_migrations`.
//!
//! Adding a new migration:
//!   1. Drop a file in `src-tauri/migrations/NNN_label.sql` (must be IF NOT EXISTS-safe).
//!   2. Register it in the `MIGRATIONS` array below.
//!   3. Bump `current_version()` if you also want to surface it.

use chrono::Utc;
use rusqlite::Connection;

use crate::error::Result;

struct Migration {
    version: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: "001_initial",
    sql: include_str!("../../migrations/001_initial.sql"),
}];

pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    // schema_migrations is also created by 001 itself, but we need to read
    // from it before the first migration runs, so create it idempotently here.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version    TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );",
    )?;

    for migration in MIGRATIONS {
        let already_applied: bool = conn
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = ?1",
                [migration.version],
                |_| Ok(true),
            )
            .unwrap_or(false);

        if already_applied {
            continue;
        }

        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
            [migration.version, Utc::now().to_rfc3339().as_str()],
        )?;
        tx.commit()?;
        tracing::info!("applied migration {}", migration.version);
    }

    Ok(())
}
