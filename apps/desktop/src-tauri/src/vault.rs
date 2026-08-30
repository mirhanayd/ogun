//! Süreç ömrü boyunca TEK bir Stronghold kasa (vault) örneği paylaşımı.
//!
//! NEDEN BU MODÜL VAR: secure_storage.rs, local DB anahtarı ve PIN profilleri
//! aynı snapshot dosyasını (native-session.stronghold) kullanır. Her komutta
//! yeni bir kasa açmak Argon2 türetimini ve snapshot çözümünü tekrarlar.
//!
//! Çözüm: örneği bir kez açıp süreç boyunca yeniden kullanmak. Bir Stronghold
//! snapshot'ı birden fazla client'ı (auth, DB secret ve PIN profilleri)
//! aynı anda tutabilir; `save()` hepsini birlikte diske yazar. Tek örnek,
//! eski "her çağrıda taze örnek" davranışının veri yönünden aynısıdır —
//! sadece tekrarlanan açma maliyeti ortadan kalkar.
//!
//! NOT: Mutex'i f() boyunca tuttuğumuz için tüm kasa işlemleri doğal olarak
//! sıraya girer; iota_stronghold'un aktör tabanlı iç yapısıyla birlikte bu,
//! eş zamanlı komutların snapshot'ı bozmasını imkânsız kılar.

use iota_stronghold::{Client, ClientError};
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

/// Paylaşılan kasa örneğinden bir client'ı açar; henüz hiç yazılmamışsa
/// `Ok(None)` döner (çağıran taraf boş belge okumak ya da yeni client
/// oluşturmak arasında kendi kararını verir).
///
/// KÖK NEDEN NOTU ("PIN oluşturulamadı — Bu cihazda kayıtlı hesap
/// bulunamadı", 0.2.8 tanı günlüğüyle doğrulandı): iota_stronghold'un
/// `load_client`'ı, client bu örnek belleğine DAHA ÖNCE yüklendiyse
/// `ClientAlreadyLoaded` HATASI DÖNER (bkz. iota_stronghold 2.1.0,
/// types/stronghold.rs `load_client` doc-comment: "...or a client with the
/// same id has already been loaded before"). Süreç boyunca TEK bir kasa
/// örneği paylaştığımız için ikinci ve sonraki tüm erişimler bu hatayı
/// alır; eski kod hatayı "client henüz yok" sanıyordu — okuma tarafı boş
/// belgeye düşüyor (bütün kayıt aramaları "Bu cihazda kayıtlı hesap
/// bulunamadı." ile çöküyordu), yazma tarafı ise `create_client` ile mevcut
/// client'ın BELLEK DURUMUNU SIFIRLAYIP üzerine yazıyordu. Doğru erişim
/// sırası: önce `get_client` (örneğin bellekteki haritası), olmazsa
/// `load_client` (snapshot'tan okuma), ikisi de yoksa gerçekten yoktur.
pub fn open_client(vault: &Stronghold, client_path: &[u8]) -> Result<Option<Client>, String> {
    match vault.get_client(client_path) {
        Ok(client) => Ok(Some(client)),
        Err(_) => match vault.load_client(client_path) {
            Ok(client) => Ok(Some(client)),
            // Snapshot'ta da yok = bu makinede henüz hiç kayıt yazılmamış.
            Err(ClientError::ClientDataNotPresent) => Ok(None),
            Err(err) => Err(format!("Cihaz kasası istemcisi açılamadı: {err}")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Bu test, yukarıdaki KÖK NEDEN NOTU'ndaki tuzağı kalıcılaştırır:
    // paylaşılan örnekte bir client İKİNCİ kez erişildiğinde bile
    // `open_client` onu bulmalıdır. Eski doğrudan `load_client` kullanımı
    // ikinci çağrıda ClientAlreadyLoaded hatası alıp "kayıt yok" yanılgısına
    // düşüyordu (0.2.6-0.2.8 "PIN oluşturulamadı" hatasının kökü).
    #[test]
    fn open_client_finds_a_client_that_was_already_loaded() {
        let dir = std::env::temp_dir().join(format!("ogun-vault-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let salt_path = dir.join("open-client-test.salt");
        let key = KeyDerivation::argon2(VAULT_PASSPHRASE, &salt_path);
        let vault = Stronghold::new(dir.join("open-client-test.stronghold"), key).unwrap();

        const TEST_CLIENT: &[u8] = b"ogun-open-client-test";

        // Henüz hiç yazılmamış: None (hata DEĞİL).
        assert!(open_client(&vault, TEST_CLIENT).unwrap().is_none());

        // Client oluşturuldu — artık aynı örnek üzerinden yapılan TÜM
        // erişimler onu görmeli.
        vault.create_client(TEST_CLIENT).unwrap();
        assert!(open_client(&vault, TEST_CLIENT).unwrap().is_some());
        assert!(open_client(&vault, TEST_CLIENT).unwrap().is_some());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
