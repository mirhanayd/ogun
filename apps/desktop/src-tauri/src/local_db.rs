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
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWorkspaceInput {
    pub domains: HashMap<String, Vec<LocalEntityInput>>,
    pub synced_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntity {
    pub id: String,
    pub payload: Value,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMutationInput {
    pub mutation_id: String,
    pub kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: Value,
    pub projection: Value,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalOutboxMutation {
    pub mutation_id: String,
    pub kind: String,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub payload: Value,
    pub created_at: String,
    pub attempt_count: i64,
    pub sync_status: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFoodCatalogInput {
    pub version: String,
    pub entries: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFoodCatalogInfo {
    pub version: Option<String>,
    pub entry_count: i64,
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

fn can_mutate(scope: &LocalScope, entity_type: &str) -> bool {
    match scope.role.as_str() {
        "owner" => true,
        "dietitian" => matches!(
            entity_type,
            "clients"
                | "anamneses"
                | "measurements"
                | "labResults"
                | "goals"
                | "plans"
                | "appointments"
                | "customFoods"
        ),
        "assistant" => entity_type == "appointments",
        _ => false,
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
pub async fn replace_local_workspace(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
    workspace: LocalWorkspaceInput,
) -> Result<(), String> {
    authorize(&app, &state, &scope)?;
    let total = workspace.domains.values().map(Vec::len).sum::<usize>();
    if total > 150_000 {
        return Err("Yerel çalışma alanı beklenen sınırı aşıyor.".to_string());
    }
    for entity_type in workspace.domains.keys() {
        validate_entity_type(entity_type)?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let key = load_or_create_key(&app)?;
        let mut connection = open_database(&database_path(&app)?)?;
        let scope_key = scope_key(&scope);
        let transaction = connection.transaction().map_err(|err| format!("Çalışma alanı işlemi başlatılamadı: {err}"))?;
        for (entity_type, entities) in workspace.domains {
            transaction.execute("DELETE FROM entities WHERE scope_key=?1 AND entity_type=?2", params![scope_key, entity_type]).map_err(|err| format!("Eski çalışma alanı temizlenemedi: {err}"))?;
            for entity in entities {
                let aad = format!("{scope_key}\u{1f}{entity_type}\u{1f}{}", entity.id);
                let encrypted = encrypt_json(&key, aad.as_bytes(), &entity.payload)?;
                transaction.execute("INSERT INTO entities(scope_key,entity_type,entity_id,encrypted_payload,updated_at) VALUES(?1,?2,?3,?4,?5)", params![scope_key, entity_type, entity.id, encrypted, entity.updated_at]).map_err(|err| format!("Çalışma alanı verisi yazılamadı: {err}"))?;
            }
        }
        transaction.execute("INSERT INTO sync_state(scope_key,last_synced_at,updated_at) VALUES(?1,?2,CURRENT_TIMESTAMP) ON CONFLICT(scope_key) DO UPDATE SET last_synced_at=excluded.last_synced_at,last_error=NULL,updated_at=CURRENT_TIMESTAMP", params![scope_key, workspace.synced_at]).map_err(|err| format!("Sync durumu yazılamadı: {err}"))?;
        transaction.commit().map_err(|err| format!("Çalışma alanı kaydedilemedi: {err}"))
    }).await.map_err(|err| format!("Çalışma alanı işlemi tamamlanamadı: {err}"))?
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

/// Applies the optimistic entity projection and inserts its encrypted outbox
/// envelope in one SQLite transaction. Reusing a mutation id is a no-op.
#[tauri::command]
pub async fn apply_local_mutation(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
    mutation: LocalMutationInput,
) -> Result<(), String> {
    authorize(&app, &state, &scope)?;
    validate_entity_type(&mutation.entity_type)?;
    if !can_mutate(&scope, &mutation.entity_type) {
        return Err("Rolünüz bu değişikliği çevrimdışı yapmaya izin vermiyor.".to_string());
    }
    if mutation.mutation_id.is_empty()
        || mutation.mutation_id.len() > 160
        || mutation.kind.is_empty()
        || mutation.entity_id.is_empty()
        || !matches!(
            mutation.operation.as_str(),
            "create" | "update" | "upsert" | "delete" | "replace"
        )
    {
        return Err("Yerel mutasyon zarfı geçersiz.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let key = load_or_create_key(&app)?;
        let mut connection = open_database(&database_path(&app)?)?;
        let scope_key = scope_key(&scope);
        let transaction = connection
            .transaction()
            .map_err(|err| format!("Yerel mutasyon başlatılamadı: {err}"))?;
        let duplicate: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM outbox WHERE mutation_id=?1)",
                params![mutation.mutation_id],
                |row| row.get(0),
            )
            .map_err(|err| format!("Yerel mutasyon kimliği denetlenemedi: {err}"))?;
        if duplicate {
            return transaction
                .commit()
                .map_err(|err| format!("Yerel mutasyon doğrulanamadı: {err}"));
        }
        let entity_aad = format!(
            "{scope_key}\u{1f}{}\u{1f}{}",
            mutation.entity_type, mutation.entity_id
        );
        let projection = encrypt_json(&key, entity_aad.as_bytes(), &mutation.projection)?;
        transaction
            .execute(
                "INSERT INTO entities(scope_key,entity_type,entity_id,encrypted_payload,updated_at,deleted) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(scope_key,entity_type,entity_id) DO UPDATE SET encrypted_payload=excluded.encrypted_payload,updated_at=excluded.updated_at,deleted=excluded.deleted",
                params![scope_key, mutation.entity_type, mutation.entity_id, projection, mutation.created_at, i64::from(mutation.operation == "delete")],
            )
            .map_err(|err| format!("Yerel görünüm güncellenemedi: {err}"))?;
        let outbox_aad = format!("{scope_key}\u{1f}outbox\u{1f}{}", mutation.mutation_id);
        let envelope = serde_json::json!({ "kind": mutation.kind, "payload": mutation.payload });
        let payload = encrypt_json(&key, outbox_aad.as_bytes(), &envelope)?;
        transaction
            .execute(
                "INSERT INTO outbox(mutation_id,scope_key,entity_type,entity_id,operation,encrypted_payload,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![mutation.mutation_id, scope_key, mutation.entity_type, mutation.entity_id, mutation.operation, payload, mutation.created_at],
            )
            .map_err(|err| format!("Yerel outbox kaydedilemedi: {err}"))?;
        transaction
            .commit()
            .map_err(|err| format!("Yerel mutasyon kalıcılaştırılamadı: {err}"))
    })
    .await
    .map_err(|err| format!("Yerel mutasyon işlemi tamamlanamadı: {err}"))?
}

#[tauri::command]
pub async fn load_local_outbox(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
    limit: usize,
) -> Result<Vec<LocalOutboxMutation>, String> {
    authorize(&app, &state, &scope)?;
    tauri::async_runtime::spawn_blocking(move || {
        let key = load_or_create_key(&app)?;
        let connection = open_database(&database_path(&app)?)?;
        let scope_key = scope_key(&scope);
        let mut statement = connection
            .prepare("SELECT mutation_id,entity_type,entity_id,operation,encrypted_payload,created_at,attempt_count,sync_status,last_error FROM outbox WHERE scope_key=?1 AND sync_status IN ('pending','failed') AND (next_attempt_at IS NULL OR datetime(next_attempt_at) <= datetime('now')) ORDER BY created_at LIMIT ?2")
            .map_err(|err| format!("Outbox sorgusu hazırlanamadı: {err}"))?;
        let rows = statement
            .query_map(params![scope_key, limit.clamp(1, 500)], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, Vec<u8>>(4)?, row.get::<_, String>(5)?, row.get::<_, i64>(6)?, row.get::<_, String>(7)?, row.get::<_, Option<String>>(8)?))
            })
            .map_err(|err| format!("Outbox okunamadı: {err}"))?;
        let mut result = Vec::new();
        for row in rows {
            let (mutation_id, entity_type, entity_id, operation, encrypted, created_at, attempt_count, sync_status, last_error) = row.map_err(|err| format!("Outbox satırı okunamadı: {err}"))?;
            let aad = format!("{scope_key}\u{1f}outbox\u{1f}{mutation_id}");
            let payload = decrypt_json(&key, aad.as_bytes(), &encrypted)?;
            let kind = payload.get("kind").and_then(Value::as_str).unwrap_or(&operation).to_string();
            let payload = payload.get("payload").cloned().unwrap_or(payload);
            result.push(LocalOutboxMutation { mutation_id, kind, entity_type, entity_id, operation, payload, created_at, attempt_count, sync_status, last_error });
        }
        Ok(result)
    })
    .await
    .map_err(|err| format!("Outbox işlemi tamamlanamadı: {err}"))?
}

#[tauri::command]
pub async fn acknowledge_local_outbox(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
    mutation_ids: Vec<String>,
) -> Result<(), String> {
    authorize(&app, &state, &scope)?;
    if mutation_ids.len() > 500 {
        return Err("Tek seferde en fazla 500 mutasyon onaylanabilir.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut connection = open_database(&database_path(&app)?)?;
        let transaction = connection
            .transaction()
            .map_err(|err| format!("Outbox onayı başlatılamadı: {err}"))?;
        let scope_key = scope_key(&scope);
        for mutation_id in mutation_ids {
            transaction
                .execute(
                    "DELETE FROM outbox WHERE scope_key=?1 AND mutation_id=?2",
                    params![scope_key, mutation_id],
                )
                .map_err(|err| format!("Outbox onaylanamadı: {err}"))?;
        }
        transaction
            .commit()
            .map_err(|err| format!("Outbox onayı kaydedilemedi: {err}"))
    })
    .await
    .map_err(|err| format!("Outbox onayı tamamlanamadı: {err}"))?
}

#[tauri::command]
pub async fn fail_local_outbox_mutation(
    app: AppHandle,
    state: State<'_, OfflineVaultState>,
    scope: LocalScope,
    mutation_id: String,
    error: String,
) -> Result<(), String> {
    authorize(&app, &state, &scope)?;
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&database_path(&app)?)?;
        let scope_key = scope_key(&scope);
        connection.execute(
            "UPDATE outbox SET sync_status='failed',attempt_count=attempt_count+1,last_error=?3,next_attempt_at=datetime('now','+' || MIN(3600, 2 << MIN(attempt_count,10)) || ' seconds') WHERE scope_key=?1 AND mutation_id=?2",
            params![scope_key, mutation_id, error.chars().take(1000).collect::<String>()],
        ).map_err(|err| format!("Outbox hata durumu kaydedilemedi: {err}"))?;
        Ok(())
    }).await.map_err(|err| format!("Outbox hata işlemi tamamlanamadı: {err}"))?
}

fn normalize_food_query(value: &str) -> String {
    value
        .to_lowercase()
        .chars()
        .filter_map(|character| match character {
            'ç' => Some('c'),
            'ğ' => Some('g'),
            'ı' | 'i' => Some('i'),
            'ö' => Some('o'),
            'ş' => Some('s'),
            'ü' => Some('u'),
            '\u{307}' => None,
            character if character.is_alphanumeric() => Some(character),
            _ => Some(' '),
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub async fn local_food_catalog_info(app: AppHandle) -> Result<LocalFoodCatalogInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&database_path(&app)?)?;
        let version = connection
            .query_row(
                "SELECT value FROM local_db_metadata WHERE key='food_catalog_version'",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| format!("Besin katalog sürümü okunamadı: {err}"))?;
        let entry_count = connection
            .query_row("SELECT COUNT(*) FROM foods", [], |row| row.get(0))
            .map_err(|err| format!("Besin katalog sayısı okunamadı: {err}"))?;
        Ok(LocalFoodCatalogInfo {
            version,
            entry_count,
        })
    })
    .await
    .map_err(|err| format!("Besin katalog bilgisi alınamadı: {err}"))?
}

#[tauri::command]
pub async fn replace_local_food_catalog(
    app: AppHandle,
    catalog: LocalFoodCatalogInput,
) -> Result<(), String> {
    if catalog.version.trim().is_empty() || catalog.entries.len() > 150_000 {
        return Err("Besin kataloğu geçersiz.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut connection = open_database(&database_path(&app)?)?;
        let transaction = connection
            .transaction()
            .map_err(|err| format!("Besin kataloğu güncellemesi başlatılamadı: {err}"))?;
        transaction
            .execute("DELETE FROM foods", [])
            .map_err(|err| format!("Eski besin kataloğu temizlenemedi: {err}"))?;
        for entry in catalog.entries {
            let id = entry.get("id").and_then(Value::as_str).unwrap_or_default();
            let name = entry
                .get("nameTr")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if id.is_empty() || name.is_empty() {
                return Err("Besin kataloğunda kimlik veya ad eksik.".to_string());
            }
            let search_text = entry
                .get("searchText")
                .and_then(Value::as_str)
                .map(normalize_food_query)
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| normalize_food_query(name));
            let group_name = entry.get("groupNameTr").and_then(Value::as_str);
            let payload = serde_json::to_string(&entry)
                .map_err(|err| format!("Besin kaydı kodlanamadı: {err}"))?;
            transaction.execute(
                "INSERT INTO foods(food_id,catalog_version,name_tr,normalized_name,search_text,group_name_tr,payload_json) VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![id, catalog.version, name, normalize_food_query(name), search_text, group_name, payload],
            ).map_err(|err| format!("Besin kaydı yazılamadı: {err}"))?;
        }
        transaction.execute(
            "INSERT INTO local_db_metadata(key,value) VALUES('food_catalog_version',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![catalog.version],
        ).map_err(|err| format!("Besin katalog sürümü yazılamadı: {err}"))?;
        transaction
            .commit()
            .map_err(|err| format!("Besin kataloğu kaydedilemedi: {err}"))
    })
    .await
    .map_err(|err| format!("Besin kataloğu güncellenemedi: {err}"))?
}

#[tauri::command]
pub async fn search_local_foods(
    app: AppHandle,
    query: String,
    limit: usize,
) -> Result<Vec<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&database_path(&app)?)?;
        let normalized = normalize_food_query(&query);
        if normalized.is_empty() {
            return Ok(Vec::new());
        }
        let pattern = format!("%{}%", normalized.replace('%', "").replace('_', ""));
        let prefix = format!("{}%", normalized.replace('%', "").replace('_', ""));
        let mut statement = connection.prepare(
            "SELECT payload_json FROM foods WHERE search_text LIKE ?1 ORDER BY CASE WHEN normalized_name LIKE ?2 THEN 0 ELSE 1 END, name_tr LIMIT ?3",
        ).map_err(|err| format!("Besin araması hazırlanamadı: {err}"))?;
        let rows = statement.query_map(params![pattern, prefix, limit.clamp(1, 50)], |row| row.get::<_, String>(0))
            .map_err(|err| format!("Besin araması yapılamadı: {err}"))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(serde_json::from_str(&row.map_err(|err| format!("Besin satırı okunamadı: {err}"))?)
                .map_err(|err| format!("Besin kaydı çözülemedi: {err}"))?);
        }
        Ok(result)
    }).await.map_err(|err| format!("Besin araması tamamlanamadı: {err}"))?
}

#[tauri::command]
pub async fn get_local_food_entries(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<Vec<Value>, String> {
    if ids.len() > 500 {
        return Err("Tek seferde en fazla 500 besin okunabilir.".to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let connection = open_database(&database_path(&app)?)?;
        let mut result = Vec::new();
        for id in ids {
            let payload: Option<String> = connection
                .query_row(
                    "SELECT payload_json FROM foods WHERE food_id=?1",
                    params![id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|err| format!("Besin kaydı okunamadı: {err}"))?;
            if let Some(payload) = payload {
                result.push(
                    serde_json::from_str(&payload)
                        .map_err(|err| format!("Besin kaydı çözülemedi: {err}"))?,
                );
            }
        }
        Ok(result)
    })
    .await
    .map_err(|err| format!("Besin kayıtları tamamlanamadı: {err}"))?
}

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

    #[test]
    fn outbox_mutation_ids_are_unique() {
        let connection = Connection::open_in_memory().unwrap();
        let mut connection = connection;
        apply_migrations(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO scopes(scope_key,user_id,clinic_id,role) VALUES('s','u','c','owner')",
                [],
            )
            .unwrap();
        connection.execute("INSERT INTO outbox(mutation_id,scope_key,entity_type,entity_id,operation,encrypted_payload,created_at) VALUES('m','s','clients','c1','update',X'01','2026-08-29T00:00:00Z')", []).unwrap();
        assert!(connection.execute("INSERT INTO outbox(mutation_id,scope_key,entity_type,entity_id,operation,encrypted_payload,created_at) VALUES('m','s','clients','c1','update',X'01','2026-08-29T00:00:00Z')", []).is_err());
    }

    #[test]
    fn food_queries_are_turkish_normalized() {
        assert_eq!(
            normalize_food_query("  Çiğ Şeftali, Üzüm — İncir! "),
            "cig seftali uzum incir"
        );
    }
}
