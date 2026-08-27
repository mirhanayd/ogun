//! Encrypted, restart-safe offline workspace for the desktop client.
//!
//! The browser origin is not used as the source of truth for clinical data.
//! Profiles, cached workspace snapshots and the mutation journal live in the
//! same Stronghold snapshot as the native session token. A local PIN only
//! unlocks one profile for the lifetime of the process; the hash is Argon2id
//! and failed attempts are rate limited.
//!
//! PERFORMANS NOTU (kullanıcı raporu: "giriş yaptıktan sonra arayüz çok
//! kasıyor"): komutlar bilinçli olarak `async fn` + `spawn_blocking`
//! deseniyle yazıldı. Tauri'de SENKRON bir komut ANA İŞ PARÇACIĞINDA
//! çalışır; eski kod her komutta Argon2 türetimi + tam snapshot açma yapan
//! yeni bir kasa örneği açtığı için girişten hemen sonra art arda çağrılan
//! komutlar pencereyi saniyelerce donduruyordu. Artık kasa örneği süreç
//! boyunca paylaşılıyor (bkz. vault.rs) ve ağır işler bloklayan iş parçacığı
//! havuzunda koşuyor — ana iş parçacığı hiçbir kasa işlemini beklemez.

use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    net::{TcpStream, ToSocketAddrs},
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};

const CLIENT_PATH: &[u8] = b"ogun-offline-workspace";
const DOCUMENT_KEY: &[u8] = b"offline-vault-v1";
const FOOD_CATALOG_KEY: &[u8] = b"offline-food-catalog-v1";
const MAX_FAILED_ATTEMPTS: u8 = 5;
const LOCKOUT_DURATION: Duration = Duration::from_secs(30);
const NETWORK_CONNECT_TIMEOUT: Duration = Duration::from_secs(2);

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
pub struct OfflineMutation {
    pub id: String,
    pub kind: String,
    pub payload: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockedWorkspace {
    pub profile: OfflineProfileSummary,
    pub workspace: Value,
    pub pending_mutations: Vec<OfflineMutation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineFoodEntry {
    pub id: String,
    pub name_tr: String,
    pub search_text: String,
    pub group_name_tr: Option<String>,
    pub kcal_per_100g: Option<f64>,
    pub protein_per_100g: Option<f64>,
    pub carb_per_100g: Option<f64>,
    pub fat_per_100g: Option<f64>,
    pub default_portion_label: Option<String>,
    pub default_portion_grams: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineFoodCatalog {
    pub version: String,
    pub entries: Vec<OfflineFoodEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OfflineProfileRecord {
    summary: OfflineProfileSummary,
    pin_hash: Option<String>,
    #[serde(default)]
    workspace: Value,
    #[serde(default)]
    pending_mutations: Vec<OfflineMutation>,
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
            version: 1,
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
    food_catalog: Option<OfflineFoodCatalog>,
}

#[derive(Default)]
pub struct OfflineVaultState(Mutex<RuntimeState>);

fn load_document(app: &AppHandle) -> Result<VaultDocument, String> {
    crate::vault::with_vault(app, |vault| {
        // Henüz hiç offline kayıt yazılmamışsa boş belge normaldir.
        let Some(client) = crate::vault::open_client(vault, CLIENT_PATH)? else {
            return Ok(VaultDocument::default());
        };
        let bytes = client
            .store()
            .get(DOCUMENT_KEY)
            .map_err(|err| format!("Çevrimdışı kasa okunamadı: {err}"))?;
        match bytes {
            Some(value) => serde_json::from_slice(&value)
                .map_err(|err| format!("Çevrimdışı kasa verisi bozuk: {err}")),
            None => Ok(VaultDocument::default()),
        }
    })
}

fn save_document(app: &AppHandle, document: &VaultDocument) -> Result<(), String> {
    crate::vault::with_vault(app, |vault| {
        // DİKKAT: mevcut client'ı open_client ile YENİDEN KULLAN —
        // koşulsuz create_client, o clientın bellek durumunu sıfırlayıp
        // üzerine yazar (bkz. vault.rs open_client kök neden notu).
        let client = match crate::vault::open_client(vault, CLIENT_PATH)? {
            Some(client) => client,
            None => vault
                .create_client(CLIENT_PATH)
                .map_err(|err| format!("Çevrimdışı kasa istemcisi oluşturulamadı: {err}"))?,
        };
        let bytes = serde_json::to_vec(document)
            .map_err(|err| format!("Çevrimdışı veri hazırlanamadı: {err}"))?;
        client
            .store()
            .insert(DOCUMENT_KEY.to_vec(), bytes, None)
            .map_err(|err| format!("Çevrimdışı veri kasaya yazılamadı: {err}"))?;
        vault
            .save()
            .map_err(|err| format!("Çevrimdışı kasa diske kaydedilemedi: {err}"))
    })
}

fn load_food_catalog(app: &AppHandle) -> Result<Option<OfflineFoodCatalog>, String> {
    crate::vault::with_vault(app, |vault| {
        let Some(client) = crate::vault::open_client(vault, CLIENT_PATH)? else {
            return Ok(None);
        };
        let bytes = client
            .store()
            .get(FOOD_CATALOG_KEY)
            .map_err(|err| format!("Yerel besin kataloğu okunamadı: {err}"))?;
        bytes
            .map(|value| {
                serde_json::from_slice(&value)
                    .map_err(|err| format!("Yerel besin kataloğu bozuk: {err}"))
            })
            .transpose()
    })
}

fn save_food_catalog(app: &AppHandle, catalog: &OfflineFoodCatalog) -> Result<(), String> {
    crate::vault::with_vault(app, |vault| {
        let client = match crate::vault::open_client(vault, CLIENT_PATH)? {
            Some(client) => client,
            None => vault
                .create_client(CLIENT_PATH)
                .map_err(|err| format!("Yerel besin kataloğu kasası oluşturulamadı: {err}"))?,
        };
        let bytes = serde_json::to_vec(catalog)
            .map_err(|err| format!("Yerel besin kataloğu hazırlanamadı: {err}"))?;
        client
            .store()
            .insert(FOOD_CATALOG_KEY.to_vec(), bytes, None)
            .map_err(|err| format!("Yerel besin kataloğu kaydedilemedi: {err}"))?;
        vault
            .save()
            .map_err(|err| format!("Yerel besin kataloğu diske yazılamadı: {err}"))
    })
}

fn normalize_food_search(value: &str) -> String {
    value
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| match character {
            'ç' => 'c',
            'ğ' => 'g',
            'ı' => 'i',
            'ö' => 'o',
            'ş' => 's',
            'ü' => 'u',
            other => other,
        })
        .filter(|character| character.is_alphanumeric() || character.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn save_offline_food_catalog_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &OfflineVaultState,
    catalog: OfflineFoodCatalog,
) -> Result<(), String> {
    if !is_online_app(window) {
        return Err(
            "Besin kataloğu yalnızca doğrulanmış çevrimiçi uygulamadan güncellenebilir."
                .to_string(),
        );
    }
    if catalog.entries.is_empty() || catalog.entries.len() > 30_000 {
        return Err("Besin kataloğu boş veya beklenen sınırın dışında.".to_string());
    }
    let unchanged = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?
        .food_catalog
        .as_ref()
        .is_some_and(|existing| {
            existing.version == catalog.version && existing.entries.len() == catalog.entries.len()
        });
    if unchanged {
        return Ok(());
    }
    save_food_catalog(app, &catalog)?;
    state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?
        .food_catalog = Some(catalog);
    Ok(())
}

fn search_offline_food_catalog_impl(
    app: &AppHandle,
    state: &OfflineVaultState,
    query: String,
    limit: usize,
) -> Result<Vec<OfflineFoodEntry>, String> {
    let cached = {
        let runtime = state
            .0
            .lock()
            .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
        if runtime.unlocked_user_id.is_none() && runtime.active_online_user_id.is_none() {
            return Err(
                "Besin kataloğunu kullanmak için kayıtlı hesabın kilidini açın.".to_string(),
            );
        }
        runtime.food_catalog.clone()
    };
    let catalog = match cached {
        Some(catalog) => catalog,
        None => load_food_catalog(app)?
            .ok_or_else(|| "Besin kataloğu bu cihaza henüz indirilmemiş.".to_string())?,
    };
    if state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?
        .food_catalog
        .is_none()
    {
        state
            .0
            .lock()
            .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?
            .food_catalog = Some(catalog.clone());
    }

    let normalized_query = normalize_food_search(&query);
    if normalized_query.len() < 2 {
        return Ok(Vec::new());
    }
    let mut matches = catalog
        .entries
        .into_iter()
        .filter_map(|entry| {
            let name = normalize_food_search(&entry.name_tr);
            let searchable = normalize_food_search(&entry.search_text);
            if !name.contains(&normalized_query) && !searchable.contains(&normalized_query) {
                return None;
            }
            let rank = if name == normalized_query {
                0
            } else if name.starts_with(&normalized_query) {
                1
            } else if name.contains(&normalized_query) {
                2
            } else {
                3
            };
            Some((rank, entry))
        })
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.name_tr.cmp(&right.1.name_tr))
    });
    Ok(matches
        .into_iter()
        .take(limit.clamp(1, 50))
        .map(|(_, entry)| entry)
        .collect())
}

fn get_offline_food_entries_impl(
    app: &AppHandle,
    state: &OfflineVaultState,
    ids: Vec<String>,
) -> Result<Vec<OfflineFoodEntry>, String> {
    if ids.len() > 1_000 {
        return Err("Tek seferde en fazla 1000 besin okunabilir.".to_string());
    }
    let cached = {
        let runtime = state
            .0
            .lock()
            .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
        if runtime.unlocked_user_id.is_none() && runtime.active_online_user_id.is_none() {
            return Err(
                "Besin kataloğunu kullanmak için kayıtlı hesabın kilidini açın.".to_string(),
            );
        }
        runtime.food_catalog.clone()
    };
    let catalog = match cached {
        Some(catalog) => catalog,
        None => load_food_catalog(app)?
            .ok_or_else(|| "Besin kataloğu bu cihaza henüz indirilmemiş.".to_string())?,
    };
    let requested = ids.into_iter().collect::<HashSet<_>>();
    Ok(catalog
        .entries
        .into_iter()
        .filter(|entry| requested.contains(&entry.id))
        .collect())
}

pub fn has_saved_profiles(app: &AppHandle) -> bool {
    load_document(app).is_ok_and(|document| !document.profiles.is_empty())
}

fn is_online_app(window: &WebviewWindow) -> bool {
    window.url().is_ok_and(|url| {
        matches!(
            url.host_str(),
            Some("ogun-web.vercel.app") | Some("localhost") | Some("127.0.0.1")
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

fn require_unlocked(state: &OfflineVaultState, user_id: &str) -> Result<(), String> {
    let runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    if runtime.unlocked_user_id.as_deref() == Some(user_id) {
        Ok(())
    } else {
        Err("Bu yerel hesap PIN ile açılmamış.".to_string())
    }
}

// Aşağıdaki *_impl fonksiyonları senkron gövdelidir; #[tauri::command]
// sarmalayıcıları bunları spawn_blocking içinde çalıştırır. Böylece hem
// mantık doğrudan okunup test edilebilir kalır hem de ana iş parçacığı
// asla kasa I/O'sunu beklemez.

fn list_offline_profiles_impl(app: &AppHandle) -> Result<Vec<OfflineProfileSummary>, String> {
    Ok(load_document(app)?
        .profiles
        .into_iter()
        .map(|record| record.summary)
        .collect())
}

fn upsert_offline_profile_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &OfflineVaultState,
    profile: OfflineProfileInput,
) -> Result<(), String> {
    if !is_online_app(window) {
        return Err(
            "Hesap profili yalnızca doğrulanmış çevrimiçi oturumdan güncellenebilir.".to_string(),
        );
    }
    let active_user_id = profile.user_id.clone();
    let mut document = load_document(app)?;
    if let Some(record) = document
        .profiles
        .iter_mut()
        .find(|record| record.summary.user_id == profile.user_id)
    {
        let pin_configured = record.pin_hash.is_some();
        let last_synced_at = profile
            .last_synced_at
            .or_else(|| record.summary.last_synced_at.clone());
        record.summary = OfflineProfileSummary {
            user_id: profile.user_id,
            email: profile.email,
            display_name: profile.display_name,
            clinic_id: profile.clinic_id,
            clinic_name: profile.clinic_name,
            role: profile.role,
            pin_configured,
            last_synced_at,
        };
    } else {
        document.profiles.push(OfflineProfileRecord {
            summary: OfflineProfileSummary {
                user_id: profile.user_id,
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
    save_document(app, &document)?;
    crate::startup::set_enabled_for_saved_profiles(app, true);
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    runtime.active_online_user_id = Some(active_user_id.clone());
    // Kullanıcı bu süreçte sunucu tarafından zaten doğrulandı. İnternet aynı
    // oturum içinde kesilirse ikinci kez PIN istemeden şifreli yerel çalışma
    // alanına geçebilmek için yalnız bellek içindeki kilidi aç.
    runtime.unlocked_user_id = Some(active_user_id);
    Ok(())
}

fn remove_active_offline_profile_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &OfflineVaultState,
) -> Result<(), String> {
    if !is_online_app(window) {
        return Err("Yerel hesap yalnızca açık çevrimiçi oturumdan kaldırılabilir.".to_string());
    }
    let user_id = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?
        .active_online_user_id
        .clone();
    let Some(user_id) = user_id else {
        return Ok(());
    };
    let mut document = load_document(app)?;
    document
        .profiles
        .retain(|record| record.summary.user_id != user_id);
    save_document(app, &document)?;
    crate::startup::set_enabled_for_saved_profiles(app, !document.profiles.is_empty());
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    runtime.active_online_user_id = None;
    runtime.unlocked_user_id = None;
    Ok(())
}

fn configure_offline_pin_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &OfflineVaultState,
    user_id: String,
    new_pin: String,
    current_pin: Option<String>,
) -> Result<(), String> {
    validate_pin(&new_pin)?;
    let mut document = load_document(app)?;
    let record = document
        .profiles
        .iter_mut()
        .find(|record| record.summary.user_id == user_id)
        .ok_or_else(|| "Bu cihazda kayıtlı hesap bulunamadı.".to_string())?;

    if let Some(existing_hash) = record.pin_hash.as_deref() {
        let supplied = current_pin.as_deref().unwrap_or_default();
        if !verify_pin_hash(supplied, existing_hash) {
            return Err("Mevcut PIN doğru değil.".to_string());
        }
    } else if !is_online_app(window) {
        return Err(
            "İlk PIN yalnızca çevrimiçi ve doğrulanmış oturumdayken ayarlanabilir.".to_string(),
        );
    }

    record.pin_hash = Some(hash_pin(&new_pin)?);
    record.summary.pin_configured = true;
    save_document(app, &document)?;
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    runtime.unlocked_user_id = Some(user_id);
    runtime.failed_attempts = 0;
    runtime.locked_until = None;
    Ok(())
}

fn unlock_offline_profile_impl(
    app: &AppHandle,
    state: &OfflineVaultState,
    user_id: String,
    pin: String,
) -> Result<UnlockedWorkspace, String> {
    validate_pin(&pin)?;
    {
        let mut runtime = state
            .0
            .lock()
            .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
        if let Some(until) = runtime.locked_until {
            if Instant::now() < until {
                return Err(
                    "Çok fazla hatalı deneme yapıldı. 30 saniye sonra yeniden deneyin.".to_string(),
                );
            }
            runtime.locked_until = None;
        }
    }

    let document = load_document(app)?;
    let record = document
        .profiles
        .iter()
        .find(|record| record.summary.user_id == user_id)
        .ok_or_else(|| "Bu cihazda kayıtlı hesap bulunamadı.".to_string())?;
    let valid = record
        .pin_hash
        .as_deref()
        .is_some_and(|hash| verify_pin_hash(&pin, hash));

    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    if !valid {
        runtime.failed_attempts = runtime.failed_attempts.saturating_add(1);
        if runtime.failed_attempts >= MAX_FAILED_ATTEMPTS {
            runtime.locked_until = Some(Instant::now() + LOCKOUT_DURATION);
        }
        return Err("PIN doğru değil.".to_string());
    }

    runtime.unlocked_user_id = Some(user_id);
    runtime.failed_attempts = 0;
    runtime.locked_until = None;
    Ok(UnlockedWorkspace {
        profile: record.summary.clone(),
        workspace: record.workspace.clone(),
        pending_mutations: record.pending_mutations.clone(),
    })
}

fn get_unlocked_offline_workspace_impl(
    app: &AppHandle,
    state: &OfflineVaultState,
) -> Result<Option<UnlockedWorkspace>, String> {
    let user_id = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?
        .unlocked_user_id
        .clone();
    let Some(user_id) = user_id else {
        return Ok(None);
    };
    let document = load_document(app)?;
    Ok(document
        .profiles
        .into_iter()
        .find(|record| record.summary.user_id == user_id)
        .map(|record| UnlockedWorkspace {
            profile: record.summary,
            workspace: record.workspace,
            pending_mutations: record.pending_mutations,
        }))
}

fn save_offline_workspace_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &OfflineVaultState,
    user_id: String,
    mut workspace: Value,
) -> Result<(), String> {
    if !is_online_app(window) {
        require_unlocked(state, &user_id)?;
    }
    let mut document = load_document(app)?;
    let record = document
        .profiles
        .iter_mut()
        .find(|record| record.summary.user_id == user_id)
        .ok_or_else(|| "Bu cihazda kayıtlı hesap bulunamadı.".to_string())?;
    // Tam sunucu snapshot'ı yenilenirken cihazda hazırlanmış plan taslakları
    // silinmesin. Sunucu özellikle planDrafts gönderirse onun değeri kazanır.
    if workspace.get("planDrafts").is_none() {
        if let Some(plan_drafts) = record.workspace.get("planDrafts").cloned() {
            if let Some(object) = workspace.as_object_mut() {
                object.insert("planDrafts".to_string(), plan_drafts);
            }
        }
    }
    record.workspace = workspace;
    save_document(app, &document)
}

fn save_offline_plan_draft_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &OfflineVaultState,
    user_id: String,
    plan_id: String,
    draft: Value,
) -> Result<(), String> {
    if !is_online_app(window) {
        require_unlocked(state, &user_id)?;
    }
    let mut document = load_document(app)?;
    let record = document
        .profiles
        .iter_mut()
        .find(|record| record.summary.user_id == user_id)
        .ok_or_else(|| "Bu cihazda kayıtlı hesap bulunamadı.".to_string())?;
    if !record.workspace.is_object() {
        record.workspace = serde_json::json!({ "version": 1 });
    }
    let workspace = record.workspace.as_object_mut().expect("workspace object");
    let plan_drafts = workspace
        .entry("planDrafts")
        .or_insert_with(|| serde_json::json!({}));
    if !plan_drafts.is_object() {
        *plan_drafts = serde_json::json!({});
    }
    plan_drafts
        .as_object_mut()
        .expect("planDrafts object")
        .insert(plan_id, draft);
    save_document(app, &document)
}

fn queue_offline_mutation_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    state: &OfflineVaultState,
    user_id: String,
    mutation: OfflineMutation,
) -> Result<(), String> {
    if !is_online_app(window) {
        require_unlocked(state, &user_id)?;
    }
    let mut document = load_document(app)?;
    let record = document
        .profiles
        .iter_mut()
        .find(|record| record.summary.user_id == user_id)
        .ok_or_else(|| "Bu cihazda kayıtlı hesap bulunamadı.".to_string())?;
    if let Some(existing) = record
        .pending_mutations
        .iter_mut()
        .find(|existing| existing.id == mutation.id)
    {
        *existing = mutation;
    } else {
        record.pending_mutations.push(mutation);
    }
    save_document(app, &document)
}

fn load_pending_offline_mutations_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    user_id: String,
) -> Result<Vec<OfflineMutation>, String> {
    if !is_online_app(window) {
        return Err(
            "Senkronizasyon günlüğü yalnızca çevrimiçi uygulama tarafından okunabilir.".to_string(),
        );
    }
    let document = load_document(app)?;
    Ok(document
        .profiles
        .into_iter()
        .find(|record| record.summary.user_id == user_id)
        .map(|record| record.pending_mutations)
        .unwrap_or_default())
}

fn acknowledge_offline_mutations_impl(
    app: &AppHandle,
    window: &WebviewWindow,
    user_id: String,
    mutation_ids: Vec<String>,
) -> Result<(), String> {
    if !is_online_app(window) {
        return Err("Senkronizasyon onayı yalnızca çevrimiçi uygulamadan yapılabilir.".to_string());
    }
    let mut document = load_document(app)?;
    if let Some(record) = document
        .profiles
        .iter_mut()
        .find(|record| record.summary.user_id == user_id)
    {
        record
            .pending_mutations
            .retain(|mutation| !mutation_ids.contains(&mutation.id));
    }
    save_document(app, &document)
}

/// spawn_blocking gövdesinin JoinError'ını (tauri::Error) komut hatasına
/// çevirip içteki kasa sonucuyla BİRLEŞTİRİR (`Result<Result<T, String>, _>`
/// -> `Result<T, String>`). Panik olan bir kasa işlemi süreci düşürmek
/// yerine kullanıcıya bildirilir.
fn join_result<T>(result: tauri::Result<Result<T, String>>) -> Result<T, String> {
    match result {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(err)) => Err(err),
        Err(err) => Err(format!("Cihaz kasası işlemi tamamlanamadı: {err}")),
    }
}

#[tauri::command]
pub async fn list_offline_profiles(app: AppHandle) -> Result<Vec<OfflineProfileSummary>, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || list_offline_profiles_impl(&app)).await,
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
            let state = app.state::<OfflineVaultState>();
            upsert_offline_profile_impl(&app, &window, &state, profile)
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
            let state = app.state::<OfflineVaultState>();
            remove_active_offline_profile_impl(&app, &window, &state)
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
            let state = app.state::<OfflineVaultState>();
            configure_offline_pin_impl(&app, &window, &state, user_id, new_pin, current_pin)
        })
        .await,
    )
}

#[tauri::command]
pub async fn unlock_offline_profile(
    app: AppHandle,
    user_id: String,
    pin: String,
) -> Result<UnlockedWorkspace, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            unlock_offline_profile_impl(&app, &state, user_id, pin)
        })
        .await,
    )
}

#[tauri::command]
pub fn lock_offline_profile(state: State<'_, OfflineVaultState>) -> Result<(), String> {
    // Yalnızca bellek içi bayrak — ana iş parçacığında çalışması anlık.
    let mut runtime = state
        .0
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;
    runtime.unlocked_user_id = None;
    Ok(())
}

#[tauri::command]
pub async fn get_unlocked_offline_workspace(
    app: AppHandle,
) -> Result<Option<UnlockedWorkspace>, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            get_unlocked_offline_workspace_impl(&app, &state)
        })
        .await,
    )
}

#[tauri::command]
pub async fn save_offline_workspace(
    app: AppHandle,
    window: WebviewWindow,
    user_id: String,
    workspace: Value,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            save_offline_workspace_impl(&app, &window, &state, user_id, workspace)
        })
        .await,
    )
}

#[tauri::command]
pub async fn save_offline_plan_draft(
    app: AppHandle,
    window: WebviewWindow,
    user_id: String,
    plan_id: String,
    draft: Value,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            save_offline_plan_draft_impl(&app, &window, &state, user_id, plan_id, draft)
        })
        .await,
    )
}

#[tauri::command]
pub async fn queue_offline_mutation(
    app: AppHandle,
    window: WebviewWindow,
    user_id: String,
    mutation: OfflineMutation,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            queue_offline_mutation_impl(&app, &window, &state, user_id, mutation)
        })
        .await,
    )
}

#[tauri::command]
pub async fn load_pending_offline_mutations(
    app: AppHandle,
    window: WebviewWindow,
    user_id: String,
) -> Result<Vec<OfflineMutation>, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            load_pending_offline_mutations_impl(&app, &window, user_id)
        })
        .await,
    )
}

#[tauri::command]
pub async fn acknowledge_offline_mutations(
    app: AppHandle,
    window: WebviewWindow,
    user_id: String,
    mutation_ids: Vec<String>,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            acknowledge_offline_mutations_impl(&app, &window, user_id, mutation_ids)
        })
        .await,
    )
}

#[tauri::command]
pub async fn save_offline_food_catalog(
    app: AppHandle,
    window: WebviewWindow,
    catalog: OfflineFoodCatalog,
) -> Result<(), String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            save_offline_food_catalog_impl(&app, &window, &state, catalog)
        })
        .await,
    )
}

#[tauri::command]
pub async fn search_offline_food_catalog(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<OfflineFoodEntry>, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            search_offline_food_catalog_impl(&app, &state, query, limit.unwrap_or(20))
        })
        .await,
    )
}

#[tauri::command]
pub async fn get_offline_food_entries(
    app: AppHandle,
    ids: Vec<String>,
) -> Result<Vec<OfflineFoodEntry>, String> {
    join_result(
        tauri::async_runtime::spawn_blocking(move || {
            let state = app.state::<OfflineVaultState>();
            get_offline_food_entries_impl(&app, &state, ids)
        })
        .await,
    )
}

/// DNS çözümlemesi + TCP bağlantı denemesi bazı ağlarda saniyeler sürebilir;
/// splash ekranının boot akışı bunu çağırdığından ana iş parçacığını
/// BLOKLAMAMASI zorunludur (eskiden senkrondu — açılıştaki takılmanın bir
/// başka kaynağı).
#[tauri::command]
pub async fn desktop_network_available() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        let addresses = match ("ogun-web.vercel.app", 443).to_socket_addrs() {
            Ok(addresses) => addresses,
            Err(_) => return false,
        };
        addresses
            .into_iter()
            .any(|address| TcpStream::connect_timeout(&address, NETWORK_CONNECT_TIMEOUT).is_ok())
    })
    .await
    .unwrap_or(false)
}

fn offline_page_for_route(route: Option<&str>) -> &'static str {
    match route.unwrap_or_default() {
        path if path.starts_with("/danisanlar/") => "clients",
        "/danisanlar" => "clients",
        "/randevular" => "appointments",
        path if path.starts_with("/planlar") => "plans",
        path if path.starts_with("/tarifler") || path.starts_with("/besinler") => "foods",
        path if path.starts_with("/finans") => "finance",
        path if path.starts_with("/ayarlar") => "settings",
        _ => "panel",
    }
}

#[tauri::command]
pub fn show_offline_workspace(window: WebviewWindow, route: Option<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let url = "tauri://localhost/index.html";
    #[cfg(not(target_os = "macos"))]
    let url = "http://tauri.localhost/index.html";

    let mut parsed = url
        .parse::<tauri::Url>()
        .map_err(|err| format!("Yerel adres hazırlanamadı: {err}"))?;
    parsed.set_fragment(Some(offline_page_for_route(route.as_deref())));

    window
        .navigate(parsed)
        .map_err(|err| format!("Yerel çalışma alanı açılamadı: {err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_validation_accepts_only_four_to_eight_digits() {
        assert!(validate_pin("1234").is_ok());
        assert!(validate_pin("12345678").is_ok());
        assert!(validate_pin("123").is_err());
        assert!(validate_pin("123456789").is_err());
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
    fn vault_document_is_backward_compatible_with_missing_collections() {
        let document: VaultDocument = serde_json::from_str(r#"{"version":1}"#).unwrap();
        assert!(document.profiles.is_empty());
    }

    #[test]
    fn vault_passphrase_is_defined_in_one_place() {
        // secure_storage ve bu modül AYNI snapshot dosyasını paylaştığı için
        // türetim de tek yerden (vault.rs) gelmeli — sabit dizeyi iki modülde
        // tutmak eski "her komutta yeni kasa" hatasının tekrarına davetiye
        // çıkarır. secure_storage'ın kendi testleri türetim davranışını zaten
        // kapsıyor; burada yalnızca tek-kaynak kuralı korunuyor.
        assert_eq!(
            crate::vault::VAULT_PASSPHRASE,
            "ogun-desktop-native-session-v1"
        );
    }

    #[test]
    fn live_routes_open_the_matching_local_workspace_page() {
        assert_eq!(offline_page_for_route(Some("/panel")), "panel");
        assert_eq!(offline_page_for_route(Some("/danisanlar")), "clients");
        assert_eq!(
            offline_page_for_route(Some("/danisanlar/client-1")),
            "clients"
        );
        assert_eq!(offline_page_for_route(Some("/randevular")), "appointments");
        assert_eq!(offline_page_for_route(Some("/planlar/abc")), "plans");
        assert_eq!(offline_page_for_route(Some("/tarifler")), "foods");
        assert_eq!(offline_page_for_route(Some("/finans")), "finance");
        assert_eq!(offline_page_for_route(Some("/ayarlar/ekip")), "settings");
    }

    #[test]
    fn food_search_normalization_is_turkish_insensitive() {
        assert_eq!(normalize_food_search("ÖLÇÜM IŞIL"), "olcum isil");
        assert_eq!(normalize_food_search("Çılgın  Şeftali"), "cilgin seftali");
    }
}
