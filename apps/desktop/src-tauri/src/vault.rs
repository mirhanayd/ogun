//! Süreç ömrü boyunca TEK bir Stronghold kasa (vault) örneği paylaşımı.
//!
//! NEDEN BU MODÜL VAR: secure_storage.rs ve offline_vault.rs aynı snapshot
//! dosyasını (native-session.stronghold) kullanıyor. Eski kod her komutta
//! YENİ bir `Stronghold` örneği açıyordu; bu her seferinde (1) Argon2
//! anahtar türetimi ve (2) snapshot'ın diskten okunup şifresinin çözülmesi
//! demekti. Komutlar senkron olduğu için bu maliyet ANA İŞ PARÇACIĞINDA
//! ödeniyordu — girişten hemen sonra art arda çağrılan kasa komutları
//! (upsert_offline_profile → list_offline_profiles →
//! load_pending_offline_mutations → save_offline_workspace → ...) pencereyi
//! saniyelerce donduruyordu (kullanıcı raporu: "giriş yaptıktan sonra arayüz
//! çok kasıyor"). Ayrıca save_document yazmadan ÖNCE kasayı İKİNCİ kez
//! açıyordu — yani tek bir yazım iki Argon2 türetimi yapıyordu.
//!
//! Çözüm: örneği bir kez açıp süreç boyunca yeniden kullanmak. Bir Stronghold
//! snapshot'ı birden fazla client'ı (ogun-native-auth + ogun-offline-workspace)
//! aynı anda tutabilir; `save()` hepsini birlikte diske yazar. Tek örnek,
//! eski "her çağrıda taze örnek" davranışının veri yönünden aynısıdır —
//! sadece tekrarlanan açma maliyeti ortadan kalkar.
//!
//! NOT: Mutex'i f() boyunca tuttuğumuz için tüm kasa işlemleri doğal olarak
//! sıraya girer; iota_stronghold'un aktör tabanlı iç yapısıyla birlikte bu,
//! eş zamanlı komutların snapshot'ı bozmasını imkânsız kılar.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tauri_plugin_stronghold::kdf::KeyDerivation;
use tauri_plugin_stronghold::stronghold::Stronghold;

/// bkz. secure_storage.rs'teki "KASA KİLİDİ" güvenlik notu — GERÇEK gizlilik
/// salt dosyasının varlığındadır, bu sabit dizede değil.
pub const VAULT_PASSPHRASE: &str = "ogun-desktop-native-session-v1";

const SNAPSHOT_FILE: &str = "native-session.stronghold";
const SALT_FILE: &str = "native-session.salt";

struct CachedVault {
    dir: Option<PathBuf>,
    vault: Option<Stronghold>,
}

fn cache() -> &'static Mutex<CachedVault> {
    static CACHE: OnceLock<Mutex<CachedVault>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Mutex::new(CachedVault {
            dir: None,
            vault: None,
        })
    })
}

/// Kasa üzerinde `f`'i çalıştırır; örneği gerektiğinde BİR KEZ açar ve
/// sonrakiler için önbellekte tutar. `f` çalışırken başka bir kasa işlemi
/// giremez (aynı mutex).
pub fn with_vault<T>(
    app: &AppHandle,
    f: impl FnOnce(&Stronghold) -> Result<T, String>,
) -> Result<T, String> {
    let mut cached = cache()
        .lock()
        .map_err(|_| "Cihaz kasası kilidi kullanılamıyor.".to_string())?;

    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("Yerel veri dizini çözülemedi: {err}"))?;
    std::fs::create_dir_all(&dir)
        .map_err(|err| format!("Yerel veri dizini oluşturulamadı: {err}"))?;

    if cached.dir.as_deref() != Some(dir.as_path()) || cached.vault.is_none() {
        let key = KeyDerivation::argon2(VAULT_PASSPHRASE, &dir.join(SALT_FILE));
        let vault = Stronghold::new(dir.join(SNAPSHOT_FILE), key)
            .map_err(|err| format!("Şifreli cihaz kasası açılamadı: {err}"))?;
        cached.dir = Some(dir);
        cached.vault = Some(vault);
    }
    f(cached
        .vault
        .as_ref()
        .expect("kasa önbelleği az önce dolduruldu"))
}
