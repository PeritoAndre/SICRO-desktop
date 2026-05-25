//! Read/write helpers for the `croquis` table (Spike E).
//!
//! Pattern mirrors `laudo_repo`: row in SQLite, `.sicrocroqui` file on disk.

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension, Row};
use uuid::Uuid;

use crate::error::Result;
use crate::models::{Croqui, CroquiStatus};

const COLUMNS: &str = "
    id, occurrence_id, title, relative_path, status, schema_version,
    last_export_relative_path, created_at, updated_at
";

pub fn insert(conn: &Connection, c: &Croqui) -> Result<()> {
    conn.execute(
        &format!(
            "INSERT INTO croquis ({COLUMNS}) VALUES \
             (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
        ),
        params![
            c.id.to_string(),
            c.occurrence_id.to_string(),
            c.title,
            c.relative_path,
            c.status.as_str(),
            c.schema_version,
            c.last_export_relative_path,
            c.created_at.to_rfc3339(),
            c.updated_at.to_rfc3339(),
        ],
    )?;
    Ok(())
}

pub fn list_by_occurrence(conn: &Connection, occurrence_id: &Uuid) -> Result<Vec<Croqui>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM croquis
         WHERE occurrence_id = ?1
         ORDER BY updated_at DESC"
    ))?;
    let rows = stmt
        .query_map([occurrence_id.to_string()], row_to_croqui)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

pub fn find_by_id(conn: &Connection, id: &Uuid) -> Result<Option<Croqui>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLUMNS} FROM croquis WHERE id = ?1"
    ))?;
    let row = stmt.query_row([id.to_string()], row_to_croqui).optional()?;
    Ok(row)
}

/// Update the `updated_at` (used after save / after export). Optionally bumps
/// `last_export_relative_path` and `status` in the same call.
pub fn touch(
    conn: &Connection,
    id: &Uuid,
    when: DateTime<Utc>,
    last_export: Option<&str>,
    status: Option<CroquiStatus>,
) -> Result<()> {
    if let Some(path) = last_export {
        if let Some(s) = status {
            conn.execute(
                "UPDATE croquis SET updated_at = ?2, last_export_relative_path = ?3, status = ?4
                 WHERE id = ?1",
                params![id.to_string(), when.to_rfc3339(), path, s.as_str()],
            )?;
        } else {
            conn.execute(
                "UPDATE croquis SET updated_at = ?2, last_export_relative_path = ?3
                 WHERE id = ?1",
                params![id.to_string(), when.to_rfc3339(), path],
            )?;
        }
    } else if let Some(s) = status {
        conn.execute(
            "UPDATE croquis SET updated_at = ?2, status = ?3 WHERE id = ?1",
            params![id.to_string(), when.to_rfc3339(), s.as_str()],
        )?;
    } else {
        conn.execute(
            "UPDATE croquis SET updated_at = ?2 WHERE id = ?1",
            params![id.to_string(), when.to_rfc3339()],
        )?;
    }
    Ok(())
}

fn row_to_croqui(row: &Row<'_>) -> rusqlite::Result<Croqui> {
    let id: String = row.get("id")?;
    let id = Uuid::parse_str(&id).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let occ: String = row.get("occurrence_id")?;
    let occurrence_id = Uuid::parse_str(&occ).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(e))
    })?;
    let status_str: String = row.get("status")?;
    let status = CroquiStatus::parse(&status_str).unwrap_or_default();

    Ok(Croqui {
        id,
        occurrence_id,
        title: row.get("title")?,
        relative_path: row.get("relative_path")?,
        status,
        schema_version: row.get("schema_version")?,
        last_export_relative_path: row.get("last_export_relative_path")?,
        created_at: parse_dt(row.get::<_, String>("created_at")?)?,
        updated_at: parse_dt(row.get::<_, String>("updated_at")?)?,
    })
}

fn parse_dt(s: String) -> rusqlite::Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(&s)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })
}
