//! Scoped structured storage for the packaged renderer.
//!
//! Stronghold keeps only the random database encryption key. Clinical payloads
//! are encrypted independently with XChaCha20-Poly1305 before SQLite sees them;
//! SQLite supplies transactions, indexes and durable migrations.

use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

use crate::offline_vault::OfflineVaultState;

const DB_FILE: &str = "ogun-local-v3.sqlite3";
const KEY_CLIENT: &[u8] = b"ogun-local-db-secrets";
const KEY_RECORD: &[u8] = b"clinical-db-key-v1";
const CURRENT_SCHEMA_VERSION: i64 = 3;

const MIGRATIONS: &[(i64, &str, &str)] = &[
    (
        1,
        "base",
        r#"
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS scopes (
          scope_key TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          clinic_id TEXT NOT NULL,
          role TEXT NOT NULL,
          capabilities_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, clinic_id, role)
        );
        CREATE TABLE IF NOT EXISTS entities (
          scope_key TEXT NOT NULL REFERENCES scopes(scope_key) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          encrypted_payload BLOB NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(scope_key, entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS entities_scope_type_updated
          ON entities(scope_key, entity_type, updated_at DESC);
    "#,
    ),
    (
        2,
        "outbox",
        r#"
        CREATE TABLE IF NOT EXISTS outbox (
          mutation_id TEXT PRIMARY KEY,
          scope_key TEXT NOT NULL REFERENCES scopes(scope_key) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          operation TEXT NOT NULL,
          encrypted_payload BLOB NOT NULL,
          created_at TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'pending'
            CHECK(sync_status IN ('pending','syncing','failed','blocked')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          next_attempt_at TEXT,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS outbox_scope_status_created
          ON outbox(scope_key, sync_status, created_at);
        CREATE TABLE IF NOT EXISTS sync_state (
          scope_key TEXT PRIMARY KEY REFERENCES scopes(scope_key) ON DELETE CASCADE,
          pull_cursor TEXT,
          last_synced_at TEXT,
          last_error TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    "#,
    ),
    (
        3,
        "foods",
        r#"
        CREATE TABLE IF NOT EXISTS foods (
          food_id TEXT PRIMARY KEY,
          catalog_version TEXT NOT NULL,
          name_tr TEXT NOT NULL,
          normalized_name TEXT NOT NULL,
          search_text TEXT NOT NULL,
          group_name_tr TEXT,
          payload_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS foods_normalized_name ON foods(normalized_name);
        CREATE INDEX IF NOT EXISTS foods_catalog_version ON foods(catalog_version);
        CREATE TABLE IF NOT EXISTS local_db_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
    "#,
    ),
];

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalScope {
    pub user_id: String,
    pub clinic_id: String,
    pub role: String,
    #[serde(default)]
    pub capabilities: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDatabaseInfo {
    path: String,
    schema_version: i64,
    encrypted_payloads: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntityInput {
    pub id: String,
    pub payload: Value,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntity {
    pub id: String,
    pub payload: Value,
    pub updated_at: String,
}

fn validate_scope(scope: &LocalScope) -> Result<(), String> {
    if scope.user_id.trim().is_empty() || scope.clinic_id.trim().is_empty() {
        return Err("Kullanıcı ve klinik kapsamı zorunludur.".to_string());
    }
    if !matches!(scope.role.as_str(), "owner" | "dietitian" | "assistant") {
        return Err("Bilinmeyen klinik rolü.".to_string());
    }
    Ok(())
}

fn validate_entity_type(entity_type: &str) -> Result<(), String> {
    if matches!(
        entity_type,
        "clinic"
            | "clients"
            | "anamneses"
            | "measurements"
            | "labResults"
            | "goals"
            | "payments"
            | "plans"
            | "appointments"
            | "customFoods"
    ) {
        Ok(())
    } else {
        Err("Desteklenmeyen yerel veri alanı.".to_string())
    }
}

fn scope_key(scope: &LocalScope) -> String {
    format!(
        "{}\u{1f}{}\u{1f}{}",
        scope.user_id, scope.clinic_id, scope.role
    )
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("Yerel veri dizini çözülemedi: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("Yerel veri dizini oluşturulamadı: {err}"))?;
    Ok(dir.join(DB_FILE))
}

fn open_database(path: &Path) -> Result<Connection, String> {
    let mut connection =
        Connection::open(path).map_err(|err| format!("Yerel veritabanı açılamadı: {err}"))?;
    connection
        .execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;")
        .map_err(|err| format!("Yerel veritabanı ayarlanamadı: {err}"))?;
    apply_migrations(&mut connection)?;
    Ok(connection)
}

fn apply_migrations(connection: &mut Connection) -> Result<(), String> {
    connection
        .execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);")
        .map_err(|err| format!("Migration tablosu hazırlanamadı: {err}"))?;
    let current: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|err| format!("Migration sürümü okunamadı: {err}"))?;
    for (version, name, sql) in MIGRATIONS
        .iter()
        .filter(|(version, _, _)| *version > current)
    {
        let transaction = connection
            .transaction()
            .map_err(|err| format!("Migration işlemi başlatılamadı: {err}"))?;
        transaction
            .execute_batch(sql)
            .map_err(|err| format!("Migration {version} ({name}) uygulanamadı: {err}"))?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, name) VALUES (?1, ?2)",
                params![version, name],
            )
            .map_err(|err| format!("Migration kaydı yazılamadı: {err}"))?;
        transaction
            .commit()
            .map_err(|err| format!("Migration tamamlanamadı: {err}"))?;
    }
    Ok(())
}

fn load_or_create_key(app: &AppHandle) -> Result<[u8; 32], String> {
    crate::vault::with_vault(app, |vault| {
        let client = match crate::vault::open_client(vault, KEY_CLIENT)? {
            Some(client) => client,
            None => vault
                .create_client(KEY_CLIENT)
                .map_err(|err| format!("Yerel veri anahtarı kasası oluşturulamadı: {err}"))?,
        };
        if let Some(bytes) = client
            .store()
            .get(KEY_RECORD)
            .map_err(|err| format!("Yerel veri anahtarı okunamadı: {err}"))?
        {
            return bytes
                .try_into()
                .map_err(|_| "Yerel veri anahtarı geçersiz uzunlukta.".to_string());
        }
        let mut key = [0_u8; 32];
        OsRng.fill_bytes(&mut key);
        client
            .store()
            .insert(KEY_RECORD.to_vec(), key.to_vec(), None)
            .map_err(|err| format!("Yerel veri anahtarı yazılamadı: {err}"))?;
        vault
            .save()
            .map_err(|err| format!("Yerel veri anahtarı kasası kaydedilemedi: {err}"))?;
        Ok(key)
    })
}

fn encrypt_json(key: &[u8; 32], aad: &[u8], value: &Value) -> Result<Vec<u8>, String> {
    let plain =
        serde_json::to_vec(value).map_err(|err| format!("Yerel veri kodlanamadı: {err}"))?;
    let cipher = XChaCha20Poly1305::new(key.into());
    let mut nonce = [0_u8; 24];
    OsRng.fill_bytes(&mut nonce);
    let encrypted = cipher
        .encrypt(XNonce::from_slice(&nonce), Payload { msg: &plain, aad })
        .map_err(|_| "Yerel veri şifrelenemedi.".to_string())?;
    let mut output = nonce.to_vec();
    output.extend(encrypted);
    Ok(output)
}

fn decrypt_json(key: &[u8; 32], aad: &[u8], value: &[u8]) -> Result<Value, String> {
    if value.len() <= 24 {
        return Err("Şifreli yerel veri eksik.".to_string());
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    let plain = cipher
        .decrypt(
            XNonce::from_slice(&value[..24]),
            Payload {
                msg: &value[24..],
                aad,
            },
        )
        .map_err(|_| "Yerel veri doğrulanamadı veya anahtar eşleşmiyor.".to_string())?;
    serde_json::from_slice(&plain).map_err(|err| format!("Yerel veri çözülemedi: {err}"))
}

fn authorize(app: &AppHandle, state: &OfflineVaultState, scope: &LocalScope) -> Result<(), String> {
    validate_scope(scope)?;
    crate::offline_vault::authorize_local_scope(
        app,
        state,
        &scope.user_id,
        &scope.clinic_id,
        &scope.role,
    )
}

#[tauri::command]
pub async fn desktop_db_info(app: AppHandle) -> Result<LocalDatabaseInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = database_path(&app)?;
        let connection = open_database(&path)?;
        let schema_version = connection
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .map_err(|err| format!("Schema sürümü okunamadı: {err}"))?;
        debug_assert_eq!(schema_version, CURRENT_SCHEMA_VERSION);
        Ok(LocalDatabaseInfo {
            path: path.display().to_string(),
            schema_version,
            encrypted_payloads: true,
        })
    })
    .await
    .map_err(|err| format!("Yerel veritabanı işlemi tamamlanamadı: {err}"))?
}

#[tauri::command]
pub async fn initialize_local_scope(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
) -> Result<(), String> {
    authorize(&app, &state, &scope)?;
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&database_path(&app)?)?;
        let capabilities = serde_json::to_string(&scope.capabilities)
            .map_err(|err| format!("Yetkiler kodlanamadı: {err}"))?;
        connection
            .execute(
                "INSERT INTO scopes(scope_key,user_id,clinic_id,role,capabilities_json) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(scope_key) DO UPDATE SET capabilities_json=excluded.capabilities_json,last_opened_at=CURRENT_TIMESTAMP",
                params![scope_key(&scope), scope.user_id, scope.clinic_id, scope.role, capabilities],
            )
            .map_err(|err| format!("Yerel kapsam hazırlanamadı: {err}"))?;
        Ok(())
    }).await.map_err(|err| format!("Yerel kapsam işlemi tamamlanamadı: {err}"))?
}

#[tauri::command]
pub async fn replace_local_entities(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
    entity_type: String,
    entities: Vec<LocalEntityInput>,
) -> Result<(), String> {
    authorize(&app, &state, &scope)?;
    validate_entity_type(&entity_type)?;
    if entities.len() > 100_000 {
        return Err("Yerel veri grubu beklenen sınırı aşıyor.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let key = load_or_create_key(&app)?;
        let mut connection = open_database(&database_path(&app)?)?;
        let scope_key = scope_key(&scope);
        let transaction = connection.transaction().map_err(|err| format!("Yerel veri işlemi başlatılamadı: {err}"))?;
        transaction.execute("DELETE FROM entities WHERE scope_key=?1 AND entity_type=?2", params![scope_key, entity_type]).map_err(|err| format!("Eski yerel veri temizlenemedi: {err}"))?;
        for entity in entities {
            let aad = format!("{scope_key}\u{1f}{entity_type}\u{1f}{}", entity.id);
            let encrypted = encrypt_json(&key, aad.as_bytes(), &entity.payload)?;
            transaction.execute("INSERT INTO entities(scope_key,entity_type,entity_id,encrypted_payload,updated_at) VALUES(?1,?2,?3,?4,?5)", params![scope_key, entity_type, entity.id, encrypted, entity.updated_at]).map_err(|err| format!("Yerel veri yazılamadı: {err}"))?;
        }
        transaction.commit().map_err(|err| format!("Yerel veri kaydedilemedi: {err}"))
    }).await.map_err(|err| format!("Yerel veri işlemi tamamlanamadı: {err}"))?
}

#[tauri::command]
pub async fn list_local_entities(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
    entity_type: String,
) -> Result<Vec<LocalEntity>, String> {
    authorize(&app, &state, &scope)?;
    validate_entity_type(&entity_type)?;
    tauri::async_runtime::spawn_blocking(move || {
        let key = load_or_create_key(&app)?;
        let connection = open_database(&database_path(&app)?)?;
        let scope_key = scope_key(&scope);
        let mut statement = connection.prepare("SELECT entity_id, encrypted_payload, updated_at FROM entities WHERE scope_key=?1 AND entity_type=?2 AND deleted=0 ORDER BY updated_at DESC").map_err(|err| format!("Yerel sorgu hazırlanamadı: {err}"))?;
        let rows = statement.query_map(params![scope_key, entity_type], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Vec<u8>>(1)?, row.get::<_, String>(2)?))).map_err(|err| format!("Yerel veri okunamadı: {err}"))?;
        let mut result = Vec::new();
        for row in rows {
            let (id, encrypted, updated_at) = row.map_err(|err| format!("Yerel veri satırı okunamadı: {err}"))?;
            let aad = format!("{scope_key}\u{1f}{entity_type}\u{1f}{id}");
            result.push(LocalEntity { id, payload: decrypt_json(&key, aad.as_bytes(), &encrypted)?, updated_at });
        }
        Ok(result)
    }).await.map_err(|err| format!("Yerel sorgu tamamlanamadı: {err}"))?
}

#[allow(dead_code)] // wired into logout in the desktop-auth commit
pub fn remove_scope_data(app: &AppHandle, user_id: &str) -> Result<(), String> {
    let connection = open_database(&database_path(app)?)?;
    connection
        .execute("DELETE FROM scopes WHERE user_id=?1", params![user_id])
        .map_err(|err| format!("Yerel hesap verisi temizlenemedi: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_payload_round_trip_and_tamper_detection() {
        let key = [7_u8; 32];
        let value = serde_json::json!({"patient": "Ada", "weight": 61.2});
        let encrypted = encrypt_json(&key, b"scope/client/1", &value).unwrap();
        assert!(!String::from_utf8_lossy(&encrypted).contains("Ada"));
        assert_eq!(
            decrypt_json(&key, b"scope/client/1", &encrypted).unwrap(),
            value
        );
        assert!(decrypt_json(&key, b"scope/client/2", &encrypted).is_err());
    }

    #[test]
    fn migrations_are_ordered_and_reentrant() {
        let path =
            std::env::temp_dir().join(format!("ogun-local-db-{}.sqlite", std::process::id()));
        let mut connection = Connection::open(&path).unwrap();
        apply_migrations(&mut connection).unwrap();
        apply_migrations(&mut connection).unwrap();
        let version: i64 = connection
            .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        drop(connection);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn scope_keys_include_role_and_tenant() {
        let a = LocalScope {
            user_id: "u1".into(),
            clinic_id: "c1".into(),
            role: "owner".into(),
            capabilities: vec![],
        };
        let b = LocalScope {
            user_id: "u1".into(),
            clinic_id: "c2".into(),
            role: "owner".into(),
            capabilities: vec![],
        };
        let c = LocalScope {
            user_id: "u1".into(),
            clinic_id: "c1".into(),
            role: "dietitian".into(),
            capabilities: vec![],
        };
        assert_ne!(scope_key(&a), scope_key(&b));
        assert_ne!(scope_key(&a), scope_key(&c));
    }
}
