use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMetadata {
    pub id: String,
    pub video_id: String,
    pub url: String,
    pub title: String,
    pub channel: Option<String>,
    pub duration: Option<f64>,
    pub language: Option<String>,
    pub source: String,
    #[serde(default)]
    pub transcript_path: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub status: String,
    #[serde(default)]
    pub download_time: Option<f64>,
    #[serde(default)]
    pub transcribe_time: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptData {
    pub video_id: String,
    pub title: String,
    pub channel: Option<String>,
    pub duration: Option<f64>,
    pub language: Option<String>,
    pub source: String,
    pub segments: Vec<TranscriptSegment>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub id: i64,
    pub start: f64,
    pub end: f64,
    pub text: String,
}

pub struct Database {
    conn: Mutex<Connection>,
    data_dir: PathBuf,
}

impl Database {
    pub fn new(data_dir: PathBuf) -> Result<Self, String> {
        let db_path = data_dir.join("database.sqlite");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        let db = Database {
            conn: Mutex::new(conn),
            data_dir,
        };

        db.initialize()?;
        Ok(db)
    }

    fn initialize(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                channel TEXT,
                duration INTEGER,
                language TEXT,
                source TEXT NOT NULL,
                transcript_path TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                status TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_transcripts_video_id ON transcripts(video_id);
            CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON transcripts(created_at);
            CREATE INDEX IF NOT EXISTS idx_transcripts_status ON transcripts(status);"
        ).map_err(|e| format!("Failed to create tables: {}", e))?;

        let current_version: i64 = conn
            .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| row.get(0))
            .unwrap_or(0);

        if current_version < 1 {
            conn.execute("INSERT OR REPLACE INTO schema_version (version) VALUES (1)", [])
                .map_err(|e| format!("Failed to update schema version: {}", e))?;
        }

        if current_version < 2 {
            conn.execute_batch(
                "ALTER TABLE transcripts ADD COLUMN download_time REAL;
                 ALTER TABLE transcripts ADD COLUMN transcribe_time REAL;
                 INSERT OR REPLACE INTO schema_version (version) VALUES (2);"
            ).map_err(|e| format!("Failed to migrate schema to v2: {}", e))?;
        }

        Ok(())
    }

    pub fn save_transcript(&self, metadata: &TranscriptMetadata, data: &TranscriptData) -> Result<(), String> {
        let transcripts_dir = self.data_dir.join("transcripts");
        fs::create_dir_all(&transcripts_dir)
            .map_err(|e| format!("Failed to create transcripts directory: {}", e))?;

        let transcript_path = if metadata.transcript_path.is_empty() {
            format!("transcripts/{}.json", metadata.id)
        } else {
            metadata.transcript_path.clone()
        };

        let json_path = self.data_dir.join(&transcript_path);
        let tmp_path = self.data_dir.join(format!("{}.tmp", transcript_path));

        let json = serde_json::to_string_pretty(data)
            .map_err(|e| format!("Failed to serialize transcript: {}", e))?;

        fs::write(&tmp_path, &json)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;

        fs::rename(&tmp_path, &json_path)
            .map_err(|e| format!("Failed to rename temp file: {}", e))?;

        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        conn.execute(
            "INSERT OR REPLACE INTO transcripts (id, video_id, url, title, channel, duration, language, source, transcript_path, created_at, updated_at, status, download_time, transcribe_time)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                metadata.id,
                metadata.video_id,
                metadata.url,
                metadata.title,
                metadata.channel,
                metadata.duration,
                metadata.language,
                metadata.source,
                transcript_path,
                metadata.created_at,
                metadata.updated_at,
                metadata.status,
                metadata.download_time,
                metadata.transcribe_time,
            ],
        ).map_err(|e| format!("Failed to save metadata: {}", e))?;

        Ok(())
    }

    pub fn list_transcripts(&self) -> Result<Vec<TranscriptMetadata>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let mut stmt = conn.prepare(
            "SELECT id, video_id, url, title, channel, duration, language, source, transcript_path, created_at, updated_at, status, download_time, transcribe_time
             FROM transcripts
             WHERE status = 'completed'
             ORDER BY created_at DESC"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let transcripts = stmt.query_map([], |row| {
            Ok(TranscriptMetadata {
                id: row.get(0)?,
                video_id: row.get(1)?,
                url: row.get(2)?,
                title: row.get(3)?,
                channel: row.get(4)?,
                duration: row.get(5)?,
                language: row.get(6)?,
                source: row.get(7)?,
                transcript_path: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                status: row.get(11)?,
                download_time: row.get(12)?,
                transcribe_time: row.get(13)?,
            })
        }).map_err(|e| format!("Failed to query transcripts: {}", e))?;

        let mut result = Vec::new();
        for transcript in transcripts {
            if let Ok(t) = transcript {
                result.push(t);
            }
        }

        Ok(result)
    }

    pub fn get_transcript(&self, transcript_id: &str) -> Result<(TranscriptMetadata, TranscriptData), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let metadata: TranscriptMetadata = conn.query_row(
            "SELECT id, video_id, url, title, channel, duration, language, source, transcript_path, created_at, updated_at, status, download_time, transcribe_time
             FROM transcripts
             WHERE id = ?1",
            params![transcript_id],
            |row| {
                Ok(TranscriptMetadata {
                    id: row.get(0)?,
                    video_id: row.get(1)?,
                    url: row.get(2)?,
                    title: row.get(3)?,
                    channel: row.get(4)?,
                    duration: row.get(5)?,
                    language: row.get(6)?,
                    source: row.get(7)?,
                    transcript_path: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                    status: row.get(11)?,
                    download_time: row.get(12)?,
                    transcribe_time: row.get(13)?,
                })
            }
        ).map_err(|e| format!("Transcript not found: {}", e))?;

        drop(conn);

        let json_path = self.data_dir.join(&metadata.transcript_path);
        let json = fs::read_to_string(&json_path)
            .map_err(|e| format!("Failed to read transcript file: {}", e))?;

        let data: TranscriptData = match serde_json::from_str(&json) {
            Ok(d) => d,
            Err(_) => {
                let mut val: serde_json::Value = serde_json::from_str(&json)
                    .map_err(|e| format!("Failed to parse transcript JSON: {}", e))?;
                if let serde_json::Value::Object(ref mut map) = val {
                    let keys: Vec<String> = map.keys().cloned().collect();
                    for key in keys {
                        let camel = snake_to_camel(&key);
                        if camel != key {
                            if let Some(v) = map.remove(&key) {
                                map.insert(camel, v);
                            }
                        }
                    }
                }
                serde_json::from_value(val)
                    .map_err(|e| format!("Failed to parse transcript JSON: {}", e))?
            }
        };

        Ok((metadata, data))
    }

    pub fn delete_transcript(&self, transcript_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let transcript_path: String = conn.query_row(
            "SELECT transcript_path FROM transcripts WHERE id = ?1",
            params![transcript_id],
            |row| row.get(0),
        ).unwrap_or_default();

        conn.execute("DELETE FROM transcripts WHERE id = ?1", params![transcript_id])
            .map_err(|e| format!("Failed to delete transcript: {}", e))?;

        drop(conn);

        if !transcript_path.is_empty() {
            let json_path = self.data_dir.join(&transcript_path);
            let _ = fs::remove_file(&json_path);
        }

        Ok(())
    }

    pub fn search_transcripts(&self, query: &str) -> Result<Vec<TranscriptMetadata>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let search_pattern = format!("%{}%", query);

        let mut stmt = conn.prepare(
            "SELECT id, video_id, url, title, channel, duration, language, source, transcript_path, created_at, updated_at, status, download_time, transcribe_time
             FROM transcripts
             WHERE status = 'completed'
             AND (title LIKE ?1 OR channel LIKE ?2 OR video_id LIKE ?3)
             ORDER BY created_at DESC"
        ).map_err(|e| format!("Failed to prepare query: {}", e))?;

        let transcripts = stmt.query_map(params![search_pattern, search_pattern, search_pattern], |row| {
            Ok(TranscriptMetadata {
                id: row.get(0)?,
                video_id: row.get(1)?,
                url: row.get(2)?,
                title: row.get(3)?,
                channel: row.get(4)?,
                duration: row.get(5)?,
                language: row.get(6)?,
                source: row.get(7)?,
                transcript_path: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                status: row.get(11)?,
                download_time: row.get(12)?,
                transcribe_time: row.get(13)?,
            })
        }).map_err(|e| format!("Failed to search transcripts: {}", e))?;

        let mut result = Vec::new();
        for transcript in transcripts {
            if let Ok(t) = transcript {
                result.push(t);
            }
        }

        Ok(result)
    }
}

fn snake_to_camel(s: &str) -> String {
    let mut result = String::new();
    let mut capitalize_next = false;
    for c in s.chars() {
        if c == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            result.push(c.to_uppercase().next().unwrap_or(c));
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }
    result
}
