//! GitHub issue #54 / Prompt 9.4, GÖREV 3 — otomatik güncelleme.
//!
//! MİMARİ KARAR — bu modül TAMAMEN native/Rust taraflı, apps/web'e HİÇ
//! DOKUNMUYOR (mimari kural #3: "apps/web'in kod tabanı bu paketten hiç
//! ETKİLENMEZ"). Sürüm karşılaştırma mantığı, "kaç sürüm geride" hesabı ve
//! kullanıcıya gösterilen uyarı DİYALOĞU tamamen burada — tıpkı
//! menu_actions.rs'teki `show_version_info`'nun apps/web'e hiç dokunmadan
//! tauri-plugin-dialog kullanması gibi (bkz. o dosyanın "Sürüm bilgisi"
//! notu). Alternatif olarak apps/web'e bir "güncelleme köprüsü" bileşeni
//! (native-notification-bridge.tsx deseninin TERSİ) eklenebilirdi, ama bu
//! issue'nun apps/web'i DEĞİŞTİRMEDEN tamamlanabilir olması yeğlendi.
//!
//! DERLEME ZAMANI YAPILANDIRMA (issue metni: "sertifika/anahtar gelene
//! kadar yapılandırmayı hazır tut, ek kod değişikliği GEREKMESİN") — bu iki
//! değer tauri.conf.json'ın STATİK `plugins.updater` bloğu ÜZERİNDEN değil
//! (o blok ortam değişkeni İÇEREMEZ, salt JSON'dur), `option_env!` ile
//! DERLEME ZAMANINDA ikili dosyaya GÖMÜLÜR:
//! - `OGUN_UPDATE_MANIFEST_URL`: R2/S3'te barındırılan statik JSON manifest
//!   uç noktası (bkz. docs/desktop-deployment.md "Otomatik güncelleme").
//! - `OGUN_UPDATE_PUBKEY`: `tauri signer generate` ile üretilen minisign
//!   genel anahtarı (ÖZEL anahtar DEĞİL — bu genel/paylaşılabilir anahtar,
//!   sadece indirilen güncelleme paketinin İMZASINI doğrulamaya yarar).
//! Bu iki ortam değişkeni release CI'da (.github/workflows/desktop-release.yml)
//! GERÇEK GitHub Actions secret'larından `tauri build` çağrılmadan ÖNCE
//! set edilir. Yerel geliştirmede (`pnpm tauri dev` / imzasız `pnpm build`)
//! ikisi de TANIMSIZDIR — bu durumda `build_updater` `None` döner, güncelleme
//! kontrolü SESSİZCE atlanır (çökme YOK, bkz. `check_for_updates`). Gerçek
//! bir R2 kovası/anahtar bu sandbox'ta OLMADIĞI için bu modülün ağ
//! davranışı CANLI test EDİLEMEDİ — bkz. PR açıklaması ve README.md
//! "Doğrulama durumu" notu, AYNI dürüstlük ilkesiyle.
//!
//! "KAÇ SÜRÜM GERİDE" POLİTİKASI (issue metni: "2 sürümden fazla geride
//! kalırsa zorunlu güncelleme uyarısı") — bu repo'da her yeni özellik
//! sürümü MINOR bileşeni artırır (semver, bkz. tauri.conf.json `version`),
//! PATCH sadece hata düzeltmesidir ve "geri kalma" sayımına KATILMAZ (bir
//! hotfix'i atlamak MINOR bir özellik sürümünü atlamak kadar riskli
//! değildir). `release_ordinal` bu yüzden SADECE major.minor'ı bir SIRA
//! numarasına indirger — bkz. `is_mandatory_update` testleri.

use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::settings;

const UPDATE_MANIFEST_URL: Option<&str> = option_env!("OGUN_UPDATE_MANIFEST_URL");
const UPDATE_PUBKEY: Option<&str> = option_env!("OGUN_UPDATE_PUBKEY");

/// Bir "major.minor.patch..." sürüm dizesinin SADECE major/minor
/// bileşenlerini SAF sayıya çevirir. Baştaki bir "v" (ör. "v1.2.3") tolere
/// edilir; segment içindeki rakam-olmayan sonekler (ör. "3-beta", "3+build")
/// yalnızca BAŞTAKİ rakamlar alınarak yok sayılır.
fn release_ordinal(version: &str) -> Option<(u64, u64)> {
    let mut parts = version.trim_start_matches('v').split('.');
    let major = parse_leading_digits(parts.next()?)?;
    let minor = parse_leading_digits(parts.next()?)?;
    Some((major, minor))
}

fn parse_leading_digits(segment: &str) -> Option<u64> {
    let digits: String = segment.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

/// SAF karar mantığı — Tauri çalışma zamanı GEREKTİRMEZ, bkz. testler
/// (settings.rs/deep_link.rs'teki "saf ayrıştırma, ayrı yan etki" deseniyle
/// AYNI disiplin).
pub fn is_mandatory_update(current: &str, latest: &str) -> bool {
    match (release_ordinal(current), release_ordinal(latest)) {
        (Some((current_major, current_minor)), Some((latest_major, latest_minor))) => {
            let current_ord = current_major * 1_000 + current_minor;
            let latest_ord = latest_major * 1_000 + latest_minor;
            latest_ord.saturating_sub(current_ord) > 2
        }
        // Ayrıştırılamayan bir sürüm dizesiyle YANLIŞLIKLA "zorunlu" uyarısı
        // GÖSTERMEMEK için güvenli taraf: ayrıştırma başarısızsa zorunlu
        // SAYILMAZ (en kötü ihtimalle kullanıcı sadece opsiyonel bir
        // hatırlatma görür).
        _ => false,
    }
}

/// `OGUN_UPDATE_MANIFEST_URL`/`OGUN_UPDATE_PUBKEY` derleme zamanında
/// tanımlıysa yapılandırılmış bir `Updater` döner; değilse (yerel
/// geliştirme, gerçek R2/anahtar henüz YOKKEN) `None` döner — çağıran bunu
/// "güncelleme kontrolü bu derlemede pasif" olarak yorumlamalı, HATA
/// DEĞİLDİR.
fn build_updater(app: &AppHandle) -> Option<tauri_plugin_updater::Updater> {
    let (raw_url, pubkey) = match (UPDATE_MANIFEST_URL, UPDATE_PUBKEY) {
        (Some(url), Some(pubkey)) if !url.is_empty() && !pubkey.is_empty() => (url, pubkey),
        _ => {
            eprintln!(
                "[ogun-desktop] OGUN_UPDATE_MANIFEST_URL / OGUN_UPDATE_PUBKEY derleme zamanında \
                 tanımlanmadı — otomatik güncelleme kontrolü bu derlemede PASİF (bkz. updater.rs \
                 dosya başı notu, docs/desktop-deployment.md \"Otomatik güncelleme\" bölümü)."
            );
            return None;
        }
    };

    let endpoint = match raw_url.parse() {
        Ok(endpoint) => endpoint,
        Err(err) => {
            eprintln!("[ogun-desktop] OGUN_UPDATE_MANIFEST_URL geçerli bir URL değil: {err}");
            return None;
        }
    };

    let builder = match app.updater_builder().endpoints(vec![endpoint]) {
        Ok(builder) => builder,
        Err(err) => {
            eprintln!("[ogun-desktop] updater endpoint'i ayarlanamadı: {err}");
            return None;
        }
    };

    match builder.pubkey(pubkey).build() {
        Ok(updater) => Some(updater),
        Err(err) => {
            eprintln!("[ogun-desktop] updater oluşturulamadı: {err}");
            None
        }
    }
}

/// Uygulama açılışında (yalnızca üretimde, `lib.rs`'teki `is_dev` kontrolü
/// ARDINDAN) çağrılır — SESSİZCE çalışır: güncelleme yoksa, kontrol
/// başarısız olursa ya da bu derlemede yapılandırılmamışsa kullanıcıya
/// HİÇBİR ŞEY göstermez. Yalnızca gerçekten bir güncelleme bulunduğunda
/// diyalog açar (bkz. `prompt_update`) — zorunlu güncellemeler daha önce
/// "ertelendi" işaretlense BİLE her açılışta yeniden sorulur, opsiyonel
/// güncellemeler bir kez ertelendiyse AYNI sürüm için tekrar SORULMAZ (bkz.
/// settings.rs `dismissed_update_version`).
pub fn check_for_updates_on_startup(app: AppHandle) {
    check_for_updates(app, false);
}

/// Yardım menüsündeki "Güncellemeleri Kontrol Et" eylemi (bkz. menu.rs/
/// menu_actions.rs `ACTION_CHECK_FOR_UPDATES`) — açılıştaki SESSİZ
/// kontrolün AKSİNE her zaman bir sonuç gösterir: güncelleme yoksa "güncel"
/// bilgi diyaloğu, varsa (daha önce ertelenmiş OLSA BİLE) `prompt_update`.
pub fn check_for_updates_manual(app: AppHandle) {
    check_for_updates(app, true);
}

fn check_for_updates(app: AppHandle, manual: bool) {
    let Some(updater) = build_updater(&app) else {
        if manual {
            show_info_dialog(
                &app,
                "Güncellemeler",
                "Otomatik güncelleme bu derlemede yapılandırılmamış (güncelleme sunucusu/anahtarı \
                 henüz tanımlı değil).",
            );
        }
        return;
    };

    tauri::async_runtime::spawn(async move {
        match updater.check().await {
            Ok(Some(update)) => prompt_update(app, update, manual),
            Ok(None) => {
                if manual {
                    show_info_dialog(&app, "Güncellemeler", "Öğün güncel — yeni bir sürüm yok.");
                }
            }
            Err(err) => {
                eprintln!("[ogun-desktop] güncelleme kontrolü başarısız: {err}");
                if manual {
                    app.dialog()
                        .message(format!("Güncelleme kontrolü başarısız oldu: {err}"))
                        .title("Güncellemeler")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                }
            }
        }
    });
}

fn show_info_dialog(app: &AppHandle, title: &str, message: &str) {
    app.dialog()
        .message(message.to_string())
        .title(title.to_string())
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

/// `force`: manuel kontrolden mi (her zaman göster) yoksa açılış kontrolünden
/// mi (opsiyonel güncellemelerde erteleme tercihine SAYGI duy) geldiği.
fn prompt_update(app: AppHandle, update: Update, force: bool) {
    let mandatory = is_mandatory_update(&update.current_version, &update.version);

    if !mandatory && !force {
        if settings::get_dismissed_update_version(&app).as_deref() == Some(update.version.as_str()) {
            // Kullanıcı bu TAM sürümü daha önce "Sonra" ile ertelemiş —
            // bkz. dosya başı notu, opsiyonel güncellemeler her açılışta
            // NAG etmez.
            return;
        }
    }

    let version = update.version.clone();
    let notes = update
        .body
        .clone()
        .filter(|body| !body.trim().is_empty())
        .unwrap_or_else(|| "Bu sürüm için ayrıntılı sürüm notu eklenmedi.".to_string());

    let (title, message, kind, buttons): (String, String, MessageDialogKind, MessageDialogButtons) = if mandatory {
        (
            "Zorunlu güncelleme".to_string(),
            format!(
                "Öğün'ün yeni bir sürümü (v{version}) yayınlandı ve şu an kullandığınız sürüm \
                 birden fazla sürüm geride kaldı. Öğün sağlık verisi taşıyan bir uygulama olduğu \
                 için eski bir sürümde kalmaya devam etmek risklidir — lütfen şimdi güncelleyin.\n\n\
                 Sürüm notları:\n{notes}"
            ),
            MessageDialogKind::Warning,
            MessageDialogButtons::OkCancelCustom("Şimdi Güncelle".to_string(), "Daha Sonra Hatırlat".to_string()),
        )
    } else {
        (
            "Güncelleme mevcut".to_string(),
            format!("Öğün'ün yeni bir sürümü (v{version}) mevcut.\n\nSürüm notları:\n{notes}"),
            MessageDialogKind::Info,
            MessageDialogButtons::OkCancelCustom("Şimdi Güncelle".to_string(), "Sonra".to_string()),
        )
    };

    let app_for_dialog = app.clone();
    app.dialog().message(message).title(title).kind(kind).buttons(buttons).show(move |confirmed| {
        if confirmed {
            start_download_and_install(app_for_dialog, update);
        } else if !mandatory {
            // Zorunlu güncellemelerde "Daha Sonra Hatırlat" tıklansa BİLE
            // `dismissed_update_version` YAZILMAZ — bir sonraki açılışta
            // AYNI zorunlu uyarı yeniden gösterilir (bkz. dosya başı notu:
            // "sonsuza kadar ertele" seçeneği yok).
            settings::set_dismissed_update_version(&app_for_dialog, Some(update.version.clone()));
        }
    });
}

fn start_download_and_install(app: AppHandle, update: Update) {
    tauri::async_runtime::spawn(async move {
        let install_result = update
            .download_and_install(
                |_chunk_length, _content_length| {
                    // İlerleme çubuğu şimdilik YOK — issue metni bunu
                    // İSTEMİYOR, sadece "indirilsin/kurulsun" akışını
                    // istiyor. Terminale/log'a yazmak yeterli teşhis.
                },
                || {
                    eprintln!("[ogun-desktop] güncelleme indirmesi tamamlandı, kuruluyor...");
                },
            )
            .await;

        match install_result {
            Ok(()) => {
                eprintln!("[ogun-desktop] güncelleme kuruldu, uygulama yeniden başlatılıyor.");
                app.restart();
            }
            Err(err) => {
                eprintln!("[ogun-desktop] güncelleme indirme/kurulumu başarısız: {err}");
                app.dialog()
                    .message(format!(
                        "Güncelleme indirilemedi/kurulamadı: {err}\n\nDaha sonra tekrar deneyebilirsiniz \
                         (Yardım > Güncellemeleri Kontrol Et)."
                    ))
                    .title("Güncelleme başarısız")
                    .kind(MessageDialogKind::Error)
                    .show(|_| {});
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn not_mandatory_when_versions_equal() {
        assert!(!is_mandatory_update("1.2.0", "1.2.0"));
    }

    #[test]
    fn not_mandatory_when_one_minor_behind() {
        assert!(!is_mandatory_update("1.2.0", "1.3.0"));
    }

    #[test]
    fn not_mandatory_when_exactly_two_minors_behind() {
        assert!(!is_mandatory_update("1.2.0", "1.4.0"));
    }

    #[test]
    fn mandatory_when_more_than_two_minors_behind() {
        assert!(is_mandatory_update("1.2.0", "1.5.0"));
    }

    #[test]
    fn mandatory_across_major_bump() {
        assert!(is_mandatory_update("1.9.0", "2.2.0"));
    }

    #[test]
    fn patch_only_bumps_never_count_towards_mandatory() {
        // 10 patch sürümü öne geçse bile major.minor AYNIYSA zorunlu değil
        // — bkz. dosya başı "KAÇ SÜRÜM GERİDE" politikası notu.
        assert!(!is_mandatory_update("1.2.0", "1.2.10"));
    }

    #[test]
    fn tolerates_leading_v_and_prerelease_suffixes() {
        assert!(!is_mandatory_update("v1.2.0", "v1.3.0-beta.1"));
        assert!(is_mandatory_update("v1.0.0", "v1.9.0+build.5"));
    }

    #[test]
    fn unparsable_versions_are_never_mandatory() {
        assert!(!is_mandatory_update("garbage", "1.5.0"));
        assert!(!is_mandatory_update("1.5.0", "garbage"));
    }
}
