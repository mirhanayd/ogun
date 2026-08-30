//! PIN-gated device profiles for the packaged desktop renderer.
//!
//! Stronghold stores only profile/PIN material. Structured clinical data,
//! food rows and the durable outbox live in the encrypted local SQLite layer.
//! Legacy pre-0.3 JSON snapshots are imported once and then pruned.

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::local_db::{LegacyLocalMutation, LocalScope};

const CLIENT_PATH: &[u8] = b"ogun-offline-workspace";
const DOCUMENT_KEY: &[u8] = b"offline-vault-v1";
const LEGACY_FOOD_CATALOG_KEY: &[u8] = b"offline-food-catalog-v1";
const MAX_FAILED_ATTEMPTS: u8 = 5;
const LOCKOUT_DURATION: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineProfileSummary {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub clinic_id: String,
    pub clinic_name: String,
    pub role: String,
    pub pin_configured: bool,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineProfileInput {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub clinic_id: String,
    pub clinic_name: String,
    pub role: String,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyMutation {
    id: String,
    kind: String,
    payload: Value,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineProfileRecord {
    summary: OfflineProfileSummary,
    pin_hash: Option<String>,
    // Read old snapshots but never write clinical payloads back to Stronghold.
    #[serde(default, skip_serializing)]
    workspace: Value,
    #[serde(default, skip_serializing)]
    pending_mutations: Vec<LegacyMutation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultDocument {
    version: u32,
    #[serde(default)]
    profiles: Vec<OfflineProfileRecord>,
}

impl Default for VaultDocument {
    fn default() -> Self {
        Self {
            version: 2,
            profiles: Vec::new(),
        }
    }
}

#[derive(Default)]
struct RuntimeState {
    unlocked_user_id: Option<String>,
    active_online_user_id: Option<String>,
    failed_attempts: u8,
    locked_until: Option<Instant>,
}

#[derive(Default)]
pub struct OfflineVaultState(Mutex<RuntimeState>);

fn load_document(app: &AppHandle) -> Result<VaultDocument, String> {
    crate::vault::with_vault(app, |vault| {
        let Some(client) = crate::vault::open_client(vault, CLIENT_PATH)? else {
            return Ok(VaultDocument::default());
        };
        let value = client
            .store()
            .get(DOCUMENT_KEY)
            .map_err(|err| format!("Cihaz profilleri okunamadı: {err}"))?;
        value
            .map(|bytes| {
                serde_json::from_slice(&bytes)
                    .map_err(|err| format!("Cihaz profil verisi bozuk: {err}"))
            })
            .transpose()
            .map(|document| document.unwrap_or_default())
    })
}

fn save_document(app: &AppHandle, document: &VaultDocument) -> Result<(), String> {
    crate::vault::with_vault(app, |vault| {
        let client = match crate::vault::open_client(vault, CLIENT_PATH)? {
            Some(client) => client,
            None => vault
                .create_client(CLIENT_PATH)
                .map_err(|err| format!("Cihaz profil kasası oluşturulamadı: {err}"))?,
        };
        let bytes = serde_json::to_vec(document)
            .map_err(|err| format!("Cihaz profilleri hazırlanamadı: {err}"))?;
        client
            .store()
            .insert(DOCUMENT_KEY.to_vec(), bytes, None)
            .map_err(|err| format!("Cihaz profilleri kaydedilemedi: {err}"))?;
        vault
            .save()
            .map_err(|err| format!("Cihaz profil kasası diske yazılamadı: {err}"))
    })
}

fn load_legacy_food_catalog(app: &AppHandle) -> Result<Option<Value>, String> {
    crate::vault::with_vault(app, |vault| {
        let Some(client) = crate::vault::open_client(vault, CLIENT_PATH)? else {
            return Ok(None);
        };
        client
            .store()
            .get(LEGACY_FOOD_CATALOG_KEY)
            .map_err(|err| format!("Eski besin kataloğu okunamadı: {err}"))?
            .map(|bytes| {
                serde_json::from_slice(&bytes)
                    .map_err(|err| format!("Eski besin kataloğu bozuk: {err}"))
            })
            .transpose()
    })
}

fn clear_legacy_food_catalog(app: &AppHandle) -> Result<(), String> {
    crate::vault::with_vault(app, |vault| {
        let Some(client) = crate::vault::open_client(vault, CLIENT_PATH)? else {
            return Ok(());
        };
        client
            .store()
            .insert(LEGACY_FOOD_CATALOG_KEY.to_vec(), b"null".to_vec(), None)
            .map_err(|err| format!("Eski besin kataloğu temizlenemedi: {err}"))?;
        vault
            .save()
            .map_err(|err| format!("Cihaz kasası temizlenemedi: {err}"))
    })
}

fn capabilities(role: &str) -> Vec<String> {
    if role == "owner" {
        vec!["*".into()]
    } else if role == "assistant" {
        vec!["appointments:write".into()]
    } else {
        vec![
            "clients:assigned".into(),
            "clinical:write".into(),
            "plans:write".into(),
            "appointments:write".into(),
        ]
    }
}

fn migrate_legacy_record(app: &AppHandle, record: &OfflineProfileRecord) -> Result<(), String> {
    let scope = LocalScope {
        user_id: record.summary.user_id.clone(),
        clinic_id: record.summary.clinic_id.clone(),
        role: record.summary.role.clone(),
        capabilities: capabilities(&record.summary.role),
    };
    let mutations = record
        .pending_mutations
        .iter()
        .map(|mutation| LegacyLocalMutation {
            id: mutation.id.clone(),
            kind: mutation.kind.clone(),
            payload: mutation.payload.clone(),
            created_at: mutation.created_at.clone(),
        })
        .collect::<Vec<_>>();
    crate::local_db::migrate_legacy_profile_data(app, &scope, &record.workspace, &mutations)?;
    if let Some(catalog) = load_legacy_food_catalog(app)? {
        crate::local_db::migrate_legacy_food_catalog(app, &catalog)?;
        clear_legacy_food_catalog(app)?;
    }
    Ok(())
}

fn trusted_renderer(window: &WebviewWindow) -> bool {
    window.url().is_ok_and(|url| {
        matches!(
            url.host_str(),
            Some("ogun-web.vercel.app")
                | Some("tauri.localhost")
                | Some("localhost")
                | Some("127.0.0.1")
        )
    })
}

fn validate_pin(pin: &str) -> Result<(), String> {
    if !(4..=8).contains(&pin.len()) || !pin.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("PIN 4-8 rakamdan oluşmalıdır.".to_string());
    }
    Ok(())
}

fn hash_pin(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(pin.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|err| format!("PIN güvenli biçimde hazırlanamadı: {err}"))
}

fn verify_pin_hash(pin: &str, encoded: &str) -> bool {
    PasswordHash::new(encoded).is_ok_and(|hash| {
        Argon2::default()
            .verify_password(pin.as_bytes(), &hash)
            .is_ok()
    })
}

pub fn authorize_local_scope(
    app: &AppHandle,
    state: &OfflineVaultState,
    user_id: &str,
    clinic_id: &str,
    role: &str,
) -> Result<(), String> {
    let runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    let active = runtime.unlocked_user_id.as_deref() == Some(user_id)
        || runtime.active_online_user_id.as_deref() == Some(user_id);
    drop(runtime);
    if !active {
        return Err("Yerel çalışma alanı bu hesap için açık değil.".to_string());
    }
    let matches_scope = load_document(app)?.profiles.iter().any(|record| {
        record.summary.user_id == user_id
            && record.summary.clinic_id == clinic_id
            && record.summary.role == role
    });
    matches_scope
        .then_some(())
        .ok_or_else(|| "Yerel çalışma alanı kapsamı cihaz profiliyle eşleşmiyor.".to_string())
}

fn join_result<T>(result: tauri::Result<Result<T, String>>) -> Result<T, String> {
    match result {
        Ok(result) => result,
        Err(err) => Err(format!("Cihaz kasası işlemi tamamlanamadı: {err}")),
    }
}

pub fn has_saved_profiles(app: &AppHandle) -> bool {
    load_document(app).is_ok_and(|document| !document.profiles.is_empty())
}

#[tauri::command]
pub async fn list_offline_profiles(app: AppHandle) -> Result<Vec<OfflineProfileSummary>, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            Ok(load_document(&app)?
                .profiles
                .into_iter()
                .map(|record| record.summary)
                .collect())
        })
        .await,
    )
}

#[tauri::command]
pub async fn upsert_offline_profile(
    app: AppHandle,
    window: WebviewWindow,
    profile: OfflineProfileInput,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            if !trusted_renderer(&window) {
                return Err("Cihaz profili güvenilmeyen renderer'dan güncellenemez.".to_string());
            }
            let state = app.state::<OfflineVaultState>();
            let mut document = load_document(&app)?;
            if let Some(existing) = document
                .profiles
                .iter()
                .find(|record| record.summary.user_id == profile.user_id)
                .cloned()
            {
                migrate_legacy_record(&app, &existing)?;
            }
            if let Some(record) = document
                .profiles
                .iter_mut()
                .find(|record| record.summary.user_id == profile.user_id)
            {
                let last_synced_at = profile
                    .last_synced_at
                    .or_else(|| record.summary.last_synced_at.clone());
                record.summary = OfflineProfileSummary {
                    user_id: profile.user_id.clone(),
                    email: profile.email,
                    display_name: profile.display_name,
                    clinic_id: profile.clinic_id,
                    clinic_name: profile.clinic_name,
                    role: profile.role,
                    pin_configured: record.pin_hash.is_some(),
                    last_synced_at,
                };
            } else {
                document.profiles.push(OfflineProfileRecord {
                    summary: OfflineProfileSummary {
                        user_id: profile.user_id.clone(),
                        email: profile.email,
                        display_name: profile.display_name,
                        clinic_id: profile.clinic_id,
                        clinic_name: profile.clinic_name,
                        role: profile.role,
                        pin_configured: false,
                        last_synced_at: profile.last_synced_at,
                    },
                    pin_hash: None,
                    workspace: Value::Null,
                    pending_mutations: Vec::new(),
                });
            }
            document.version = 2;
            save_document(&app, &document)?;
            crate::startup::set_enabled_for_saved_profiles(&app, true);
            let mut runtime = state
                .0
                .lock()
                .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
            runtime.active_online_user_id = Some(profile.user_id.clone());
            runtime.unlocked_user_id = Some(profile.user_id);
            Ok(())
        })
        .await,
    )
}

#[tauri::command]
pub async fn remove_active_offline_profile(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            if !trusted_renderer(&window) {
                return Err("Yerel hesap güvenilmeyen renderer'dan kaldırılamaz.".to_string());
            }
            let state = app.state::<OfflineVaultState>();
            let user_id = {
                let runtime = state
                    .0
                    .lock()
                    .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
                runtime
                    .active_online_user_id
                    .clone()
                    .or_else(|| runtime.unlocked_user_id.clone())
            };
            let Some(user_id) = user_id else {
                return Ok(());
            };
            crate::local_db::remove_scope_data(&app, &user_id)?;
            let mut document = load_document(&app)?;
            document
                .profiles
                .retain(|record| record.summary.user_id != user_id);
            save_document(&app, &document)?;
            crate::startup::set_enabled_for_saved_profiles(&app, !document.profiles.is_empty());
            let mut runtime = state
                .0
                .lock()
                .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
            runtime.active_online_user_id = None;
            runtime.unlocked_user_id = None;
            Ok(())
        })
        .await,
    )
}

#[tauri::command]
pub async fn configure_offline_pin(
    app: AppHandle,
    window: WebviewWindow,
    user_id: String,
    new_pin: String,
    current_pin: Option<String>,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            validate_pin(&new_pin)?;
            let state = app.state::<OfflineVaultState>();
            let mut document = load_document(&app)?;
            let existing = document
                .profiles
                .iter()
                .find(|record| record.summary.user_id == user_id)
                .cloned()
                .ok_or_else(|| "Bu cihazda kayıtlı hesap bulunamadı.".to_string())?;
            migrate_legacy_record(&app, &existing)?;
            let record = document
                .profiles
                .iter_mut()
                .find(|record| record.summary.user_id == user_id)
                .expect("profile checked above");
            if let Some(hash) = record.pin_hash.as_deref() {
                if !verify_pin_hash(current_pin.as_deref().unwrap_or_default(), hash) {
                    return Err("Mevcut PIN doğru değil.".to_string());
                }
            } else if !trusted_renderer(&window) {
                return Err("İlk PIN yalnız doğrulanmış renderer'da ayarlanabilir.".to_string());
            }
            record.pin_hash = Some(hash_pin(&new_pin)?);
            record.summary.pin_configured = true;
            document.version = 2;
            save_document(&app, &document)?;
            let mut runtime = state
                .0
                .lock()
                .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
            runtime.unlocked_user_id = Some(user_id);
            runtime.failed_attempts = 0;
            runtime.locked_until = None;
            Ok(())
        })
        .await,
    )
}

#[tauri::command]
pub async fn unlock_offline_profile(
    app: AppHandle,
    user_id: String,
    pin: String,
) -> Result<OfflineProfileSummary, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            validate_pin(&pin)?;
            let state = app.state::<OfflineVaultState>();
            {
                let mut runtime = state
                    .0
                    .lock()
                    .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
                if runtime
                    .locked_until
                    .is_some_and(|until| Instant::now() < until)
                {
                    return Err(
                        "Çok fazla hatalı deneme yapıldı. 30 saniye sonra yeniden deneyin."
                            .to_string(),
                    );
                }
                runtime.locked_until = None;
            }
            let mut document = load_document(&app)?;
            let record = document
                .profiles
                .iter()
                .find(|record| record.summary.user_id == user_id)
                .cloned()
                .ok_or_else(|| "Bu cihazda kayıtlı hesap bulunamadı.".to_string())?;
            let valid = record
                .pin_hash
                .as_deref()
                .is_some_and(|hash| verify_pin_hash(&pin, hash));
            if !valid {
                let mut runtime = state
                    .0
                    .lock()
                    .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
                runtime.failed_attempts = runtime.failed_attempts.saturating_add(1);
                if runtime.failed_attempts >= MAX_FAILED_ATTEMPTS {
                    runtime.locked_until = Some(Instant::now() + LOCKOUT_DURATION);
                }
                return Err("PIN doğru değil.".to_string());
            }
            migrate_legacy_record(&app, &record)?;
            document.version = 2;
            save_document(&app, &document)?;
            let mut runtime = state
                .0
                .lock()
                .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
            runtime.unlocked_user_id = Some(user_id);
            runtime.failed_attempts = 0;
            runtime.locked_until = None;
            Ok(record.summary)
        })
        .await,
    )
}

#[tauri::command]
pub fn lock_offline_profile(state: State<'_, OfflineVaultState>) -> Result<(), String> {
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    runtime.unlocked_user_id = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_validation_accepts_only_four_to_eight_digits() {
        assert!(validate_pin("1234").is_ok());
        assert!(validate_pin("12345678").is_ok());
        assert!(validate_pin("123").is_err());
        assert!(validate_pin("12a4").is_err());
    }

    #[test]
    fn pin_hash_is_salted_and_verifiable() {
        let first = hash_pin("4826").unwrap();
        let second = hash_pin("4826").unwrap();
        assert_ne!(first, second);
        assert!(verify_pin_hash("4826", &first));
        assert!(!verify_pin_hash("4827", &first));
    }

    #[test]
    fn legacy_payloads_deserialize_but_are_not_serialized_again() {
        let document: VaultDocument = serde_json::from_str(r#"{"version":1,"profiles":[{"summary":{"userId":"u","email":"u@example.com","displayName":"U","clinicId":"c","clinicName":"C","role":"owner","pinConfigured":true,"lastSyncedAt":null},"pinHash":"hash","workspace":{"clients":[{"id":"patient"}]},"pendingMutations":[]}]}"#).unwrap();
        assert!(document.profiles[0].workspace.is_object());
        let serialized = serde_json::to_string(&document).unwrap();
        assert!(!serialized.contains("patient"));
        assert!(!serialized.contains("pendingMutations"));
    }
}
