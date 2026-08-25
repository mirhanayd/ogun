//! GitHub issue #52 / Prompt 9.2, GÖREV 3 — "Oturum kalıcılığı: Tauri'nin
//! güvenli depolama API'sini (stronghold veya OS keychain) kullanarak
//! refresh token'ı sakla, tarayıcı çerezine güvenme."
//!
//! NEDEN STRONGHOLD (bkz. Cargo.toml'daki daha uzun karar notu): resmi
//! tauri-apps organizasyonunun TEK ilk-taraf şifreli-depolama eklentisi bu;
//! ayrı bir OS keychain eklentisi resmi ekosistemde YOK.
//!
//! TASARIM KARARI — bu paketin (`tauri-plugin-stronghold`) GENEL AMAÇLI,
//! JS'den doğrudan çağrılabilir IPC komutlarını (initialize/create_client/
//! save_store_record/execute_procedure/...) HİÇ KULLANMIYORUZ. Bunun yerine
//! `tauri_plugin_stronghold::stronghold::Stronghold` ve
//! `tauri_plugin_stronghold::kdf::KeyDerivation` (her ikisi de bu paketten
//! DIŞA AÇILAN — pub — gerçek Rust API'leri, IPC değil) doğrudan bu dosyada
//! kullanılıyor ve SADECE üç dar kapsamlı, kendi komutumuzu (`store_session_
//! token` / `load_session_token` / `clear_session_token`) frontend'e
//! açıyoruz. Faydası: (1) frontend'in stronghold'un genel "herhangi bir
//! secret/anahtar sakla" IPC yüzeyine hiç erişimi YOK — saldırı yüzeyi
//! sadece "bearer oturum token'ı oku/yaz/sil" ile sınırlı; (2) JS tarafında
//! `@tauri-apps/plugin-stronghold` paketine hiç gerek YOK (bkz. apps/web/
//! src/lib/native-shell.ts — sadece jenerik `invoke()` kullanıyor).
//!
//! KASA KİLİDİ (vault password) MODELİ — GÜVENLİK İNCELEMESİ İÇİN ÖNEMLİ:
//! Kullanıcıya HİÇBİR ZAMAN bir parola SORULMUYOR ("uygulama kapanıp
//! açıldığında otomatik oturum devam etsin" gereksinimi böyle bir istemi
//! DIŞLAR). Bunun yerine, resmi pluginin KENDİ dokümante ettiği deseni
//! (`Builder::with_argon2`, bkz. o paketin lib.rs'indeki doc-comment örneği)
//! DOĞRUDAN kullanıyoruz: sabit bir uygulama içi "parola" dizesini, bu
//! makineye özgü, rastgele üretilip app-local-data dizinine (yalnızca bu
//! OS kullanıcı hesabının erişebileceği bir konum — Windows/macOS/Linux'un
//! varsayılan dosya izinleri) yazılan bir "salt" dosyasıyla birlikte
//! argon2'den geçiriyoruz. GERÇEK GİZLİLİK sabit dizede DEĞİL, rastgele
//! salt dosyasının VAR OLMASI ve sadece bu kullanıcı hesabınca okunabilir
//! olmasındadır — tehdit modeli OS keychain'lerle KABACA AYNI seviyede
//! (aynı OS kullanıcısı olarak çalışan başka bir süreç teorik olarak salt
//! dosyasını okuyup AYNI türetmeyi tekrarlayabilir — mükemmel izolasyon
//! DEĞİL, ama "diskte düz metin token" ile kıyaslanamayacak kadar daha
//! güvenli VE resmi Tauri örneğiyle AYNI, dokümante edilmiş desen). Bu
//! kararı burada AÇIKÇA belgeliyoruz ki güvenlik incelemesi (issue
//! metninde özellikle istendi) bunu bilinçli bir seçim olarak değerlendirsin.

use tauri::AppHandle;

/// Stronghold "client" adı — tek bir mantıksal ad alanı yeterli, birden
/// fazla client'a ihtiyacımız yok (sadece bir bearer token saklıyoruz).
const CLIENT_PATH: &[u8] = b"ogun-native-auth";
/// Client'ın store'u içindeki tek kayıt anahtarı.
const SESSION_TOKEN_KEY: &[u8] = b"better-auth-session-token";

// NOT (kod incelemesi PR #56): bu dosyadaki `.map_err(|err| format!("...:
// {err}"))` deseni tekrar ediyor — DRY için jenerik bir yardımcıya (`impl
// Fn(E) -> String`) çıkarmayı denedik, ama bu sandbox'ta HİÇBİR Rust kodu
// derlenemediğinden (bkz. README.md "Doğrulama durumu") böyle bir soyutlamayı
// doğrulanmadan bırakmak güvenlik-hassas bir PR için gereksiz risk —
// okunması kolay, her biri bağımsız olarak apaçık doğru olan tekrar eden
// closure'lar BİLİNÇLİ olarak KORUNDU. Küçük bir kod tekrarı, derleyiciyle
// doğrulanamayan bir soyutlamadan daha güvenli.

// PERFORMANS (kullanıcı raporu: "giriş yaptıktan sonra arayüz çok kasıyor"):
// kasa örneği artık süreç boyunca paylaşılıyor (bkz. vault.rs) ve komutlar
// spawn_blocking ile ana iş parçacığı DIŞINDA çalışıyor. Eskiden her komut
// yeni bir örnek açıp Argon2 türetimi + tam snapshot çözümü yapıyordu ve
// native-auth-bridge her sayfa yüklemesinde load_session_token çağırdığı
// için bu maliyet her açılışta ana iş parçacığında ödeniyordu.

/// Bearer oturum token'ını güvenli kasaya yazar (var olan değerin ÜZERİNE
/// yazar). Frontend'den `store_session_token` komutu olarak çağrılır (bkz.
/// apps/web/src/lib/native-shell.ts `persistNativeSessionToken`).
///
/// PERFORMANS (kod incelemesi PR #56): frontend tarafı ZATEN değişmeyen
/// token'lar için bu komutu hiç ÇAĞIRMIYOR (bkz. native-shell.ts
/// `persistNativeSessionToken` — asıl maliyet olan Argon2 türetimini VE bu
/// IPC çağrısının kendisini önler). Burada AYRICA savunmacı bir kısayol
/// EKLEMİYORUZ: kasayı yalnızca "değişti mi" diye açmak Argon2 maliyetinin
/// TAMAMINI zaten gerektirir (asıl pahalı adım) — sadece `.insert()`/
/// `.save()` diskyazımını atlamak, bu ek karmaşıklığa değecek kadar
/// anlamlı bir kazanç sağlamaz. Bilinçli bir kapsam kararı.
///
/// NOT (PR #56 sonrası): o nottaki "Argon2 türetimi her çağrıda gerekli"
/// varsayımı vault.rs'teki önbellekle birlikte artık GEÇERLİ DEĞİL — türetim
/// süreç başına BİR kez yapılıyor. Yine de "değiştiyse yaz" kısayolu
/// eklenmedi; okuma yolu zaten ucuzladı ve ek durum tutmamak daha güvenli.
#[tauri::command]
pub async fn store_session_token(app: AppHandle, token: String) -> Result<(), String> {
    // GEÇİCİ TANI (0.2.8): snapshot mtime'ının kimden geldiğini ayırt etmek
    // için (bkz. vault_log.rs). HASSAS VERİ KURALI: yalnızca uzunluk.
    crate::vault_log::log(
        &app,
        format!("store_session_token çağrıldı: tokenUzunluk={}", token.len()),
    );
    // `app` closure'a taşındığı için sonuç günlüğü klon üzerinden yazılır.
    let log_app = app.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        crate::vault::with_vault(&app, |vault| {
            let client = match vault.load_client(CLIENT_PATH) {
                Ok(client) => client,
                Err(_) => vault
                    .create_client(CLIENT_PATH)
                    .map_err(|err| format!("stronghold client oluşturulamadı: {err}"))?,
            };
            client
                .store()
                .insert(SESSION_TOKEN_KEY.to_vec(), token.into_bytes(), None)
                .map_err(|err| format!("token stronghold'a yazılamadı: {err}"))?;
            vault
                .save()
                .map_err(|err| format!("stronghold kasası diske kaydedilemedi: {err}"))
        })
    })
    .await
    .map_err(|err| format!("stronghold işlemi tamamlanamadı: {err}"))?;
    crate::vault_log::log_result(&log_app, "store_session_token", &outcome);
    outcome
}

/// Daha önce saklanmış bearer oturum token'ını okur. Hiç kaydedilmemişse
/// (ilk kurulum, ya da hiç native girişi yapılmamış) `Ok(None)` döner —
/// bu bir HATA değildir (bkz. native-shell.ts `loadNativeSessionToken`).
#[tauri::command]
pub async fn load_session_token(app: AppHandle) -> Result<Option<String>, String> {
    let log_app = app.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        crate::vault::with_vault(&app, |vault| {
            let client = match vault.load_client(CLIENT_PATH) {
                Ok(client) => client,
                Err(_) => return Ok(None),
            };
            let value = client
                .store()
                .get(SESSION_TOKEN_KEY)
                .map_err(|err| format!("token stronghold'dan okunamadı: {err}"))?;
            Ok(value.and_then(|bytes| String::from_utf8(bytes).ok()))
        })
    })
    .await
    .map_err(|err| format!("stronghold işlemi tamamlanamadı: {err}"))?;
    // GEÇİCİ TANI (0.2.8): yalnızca var-yok — token DEĞERİ asla günlüğe yazılmaz.
    match &outcome {
        Ok(Some(token)) => crate::vault_log::log(
            &log_app,
            format!("load_session_token ✓ (var, uzunluk={})", token.len()),
        ),
        Ok(None) => crate::vault_log::log(&log_app, "load_session_token ✓ (kayıtlı token yok)"),
        Err(err) => crate::vault_log::log(&log_app, format!("load_session_token ✗ hata: {err}")),
    }
    outcome
}

/// Saklanan bearer oturum token'ını siler (çıkış yapıldığında kullanılmak
/// üzere — bkz. native-shell.ts `clearNativeSessionToken`, artık
/// user-menu.tsx'in "Çıkış yap" akışından çağrılıyor). Kayıtlı bir token
/// yoksa sessizce başarılı sayılır (idempotent).
#[tauri::command]
pub async fn clear_session_token(app: AppHandle) -> Result<(), String> {
    crate::vault_log::log(&app, "clear_session_token çağrıldı (çıkış akışı)");
    let log_app = app.clone();
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        crate::vault::with_vault(&app, |vault| {
            if let Ok(client) = vault.load_client(CLIENT_PATH) {
                client
                    .store()
                    .delete(SESSION_TOKEN_KEY)
                    .map_err(|err| format!("token stronghold'dan silinemedi: {err}"))?;
                vault
                    .save()
                    .map_err(|err| format!("stronghold kasası diske kaydedilemedi: {err}"))?;
            }
            Ok(())
        })
    })
    .await
    .map_err(|err| format!("stronghold işlemi tamamlanamadı: {err}"))?;
    crate::vault_log::log_result(&log_app, "clear_session_token", &outcome);
    outcome
}

#[cfg(test)]
mod tests {
    use tauri_plugin_stronghold::kdf::KeyDerivation;

    // Bu testler Tauri çalışma zamanı GEREKTİRMEZ (AppHandle kullanmazlar) —
    // sadece argon2 anahtar türetiminin (kdf::KeyDerivation::argon2)
    // BEKLENEN özelliklerini (aynı salt+parola => aynı anahtar, farklı
    // salt => farklı anahtar) geçici bir dizinde doğrudan doğrular. Gerçek
    // Stronghold kasa aç/oku/yaz akışı ise Tauri AppHandle'a ihtiyaç
    // duyduğundan (app_local_data_dir()) burada test EDİLEMİYOR — bu,
    // navigation.rs'teki "saf mantığı platforma bağlı koddan ayır" deseninin
    // sınırı: kdf kısmı saf, dosya/AppHandle kısmı değil.

    #[test]
    fn argon2_derivation_is_deterministic_for_same_salt_file() {
        let dir = std::env::temp_dir().join(format!("ogun-kdf-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let salt_path = dir.join("test.salt");

        let key1 = KeyDerivation::argon2(crate::vault::VAULT_PASSPHRASE, &salt_path);
        let key2 = KeyDerivation::argon2(crate::vault::VAULT_PASSPHRASE, &salt_path);

        assert_eq!(
            key1, key2,
            "aynı salt dosyasıyla türetilen anahtar DETERMİNİSTİK olmalı"
        );
        assert_eq!(key1.len(), 32, "Stronghold 32 baytlık bir anahtar bekliyor");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn argon2_derivation_differs_across_separate_salt_files() {
        let dir = std::env::temp_dir().join(format!("ogun-kdf-test-2-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let salt_a = dir.join("a.salt");
        let salt_b = dir.join("b.salt");

        let key_a = KeyDerivation::argon2(crate::vault::VAULT_PASSPHRASE, &salt_a);
        let key_b = KeyDerivation::argon2(crate::vault::VAULT_PASSPHRASE, &salt_b);

        assert_ne!(
            key_a, key_b,
            "her makinede/kurulumda YENİ üretilen rastgele salt, AYNI sabit parola dizesiyle bile FARKLI anahtar üretmeli"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
