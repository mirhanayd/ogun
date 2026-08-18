//! GitHub issue #53 / Prompt 9.3, GÖREV 2 — "Pencere kapatılınca uygulama
//! tamamen kapanmasın, tray'de kalsın ... Bunu ayarlarda kapatılabilir yap."
//!
//! TASARIM KARARI (bkz. PR açıklaması) — bu tercih NEREDE saklanmalı?
//! Tauri kabuğunda henüz hiçbir "uygulama ayarları" yüzeyi YOK (issue
//! metninin kendisi bunu açıkça belirtiyor). İKİ seçenek vardı: (1)
//! apps/web'in Postgres'teki clinic/user ayarlarına EKLEMEK — ama bu,
//! SUNUCUYA senkron bir tercihi (native pencerenin kapatma davranışı,
//! sunucu tarafının hiç İLGİLENMEDİĞİ SAF bir istemci detayı) taşımak
//! demek olurdu, mimari kural #3'ü (apps/web minimal değişir) GEREKSİZ
//! YERE ihlal eder; (2) BURADA, basit bir yerel JSON dosyası (bkz.
//! secure_storage.rs'in `app_local_data_dir()` kullanımıyla AYNI desen,
//! ama şifreleme GEREKMİYOR — bu bir SIR değil, sadece bir UI tercihi).
//! (2)'yi seçtik: en basit, apps/web'e HİÇ dokunmayan, mevcut
//! `app_local_data_dir()` desenini yeniden kullanan çözüm.
//!
//! Kullanıcının bu tercihi DEĞİŞTİREBİLECEĞİ yüzey: apps/web'in MEVCUT
//! /ayarlar sayfasına (bkz. apps/web/src/app/(app)/ayarlar/page.tsx),
//! SADECE native kabukta görünen küçük, additive bir bölüm eklendi (bkz.
//! desktop-settings-section.tsx) — `get_minimize_to_tray_setting` /
//! `set_minimize_to_tray_setting` komutlarını çağırır. Ayrı bir native
//! pencere/diyalog İCAT ETMEDİK; mevcut ayarlar sayfası zaten doğru yer.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

fn default_minimize_to_tray_on_close() -> bool {
    // Varsayılan AÇIK: issue metni "pencere kapatılınca uygulama tamamen
    // kapanmasın" diyor — yani bu YENİ davranış varsayılan, kullanıcı
    // isterse (klasik "X = tamamen kapat" alışkanlığındaysa) kapatabilir.
    true
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AppSettings {
    #[serde(default = "default_minimize_to_tray_on_close")]
    pub minimize_to_tray_on_close: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            minimize_to_tray_on_close: default_minimize_to_tray_on_close(),
        }
    }
}

/// SAF ayrıştırma — bozuk/eksik/hiç var olmayan bir dosya İÇERİĞİ karşısında
/// bile PANİK ETMEZ, varsayılana düşer (bkz. testler). Tauri çalışma zamanı
/// GEREKTİRMEZ.
pub fn parse_settings(raw: &str) -> AppSettings {
    serde_json::from_str(raw).unwrap_or_default()
}

/// SAF serileştirme.
pub fn serialize_settings(settings: &AppSettings) -> String {
    serde_json::to_string_pretty(settings).expect("AppSettings serileştirilemedi")
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("app-local-data dizini çözülemedi: {err}"))?;
    std::fs::create_dir_all(&dir).map_err(|err| format!("app-local-data dizini oluşturulamadı: {err}"))?;
    Ok(dir.join("settings.json"))
}

fn load_settings_from_disk(app: &AppHandle) -> AppSettings {
    let Ok(path) = settings_path(app) else {
        return AppSettings::default();
    };
    match std::fs::read_to_string(&path) {
        Ok(raw) => parse_settings(&raw),
        // Dosya henüz hiç yazılmamış olabilir (ilk kurulum) — bu bir HATA
        // değil, sadece "hiç değiştirilmemiş varsayılan" anlamına gelir.
        Err(_) => AppSettings::default(),
    }
}

fn save_settings_to_disk(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    std::fs::write(&path, serialize_settings(settings)).map_err(|err| format!("ayarlar dosyaya yazılamadı: {err}"))
}

/// GÖREV 2'nin pencere kapatma engelleyicisinin (bkz. lib.rs) SENKRON
/// olarak okuyabilmesi için bellekte tutulan, uygulama durumu olarak
/// yönetilen (`app.manage`) önbellek — her pencere kapatma denemesinde
/// diskten okumak yerine.
pub struct SettingsState(Mutex<AppSettings>);

impl SettingsState {
    pub fn load(app: &AppHandle) -> Self {
        Self(Mutex::new(load_settings_from_disk(app)))
    }

    pub fn get(&self) -> AppSettings {
        self.0.lock().expect("SettingsState mutex zehirlendi").clone()
    }

    fn set(&self, settings: AppSettings) {
        *self.0.lock().expect("SettingsState mutex zehirlendi") = settings;
    }
}

/// apps/web /ayarlar sayfasındaki (native kabuk-farkında) bölümün okuduğu
/// komut.
#[tauri::command]
pub fn get_minimize_to_tray_setting(app: AppHandle) -> bool {
    app.state::<SettingsState>().get().minimize_to_tray_on_close
}

/// apps/web /ayarlar sayfasındaki bölümün yazdığı komut — diske YAZAR VE
/// bellek önbelleğini GÜNCELLER (aksi halde bir sonraki pencere kapatma
/// denemesi eski değeri görür, uygulama yeniden başlatılana kadar).
#[tauri::command]
pub fn set_minimize_to_tray_setting(app: AppHandle, enabled: bool) -> Result<(), String> {
    let settings = AppSettings {
        minimize_to_tray_on_close: enabled,
    };
    save_settings_to_disk(&app, &settings)?;
    app.state::<SettingsState>().set(settings);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_minimize_to_tray_is_enabled() {
        assert!(AppSettings::default().minimize_to_tray_on_close);
    }

    #[test]
    fn parse_settings_falls_back_to_default_on_garbage_input() {
        assert_eq!(parse_settings("not json at all"), AppSettings::default());
    }

    #[test]
    fn parse_settings_falls_back_to_default_on_empty_input() {
        assert_eq!(parse_settings(""), AppSettings::default());
    }

    #[test]
    fn parse_settings_roundtrips_through_serialize() {
        let settings = AppSettings {
            minimize_to_tray_on_close: false,
        };
        let raw = serialize_settings(&settings);
        assert_eq!(parse_settings(&raw), settings);
    }

    #[test]
    fn parse_settings_defaults_missing_field() {
        // Gelecekte YENİ bir alan eklenirse ESKİ bir settings.json dosyası
        // panikletmeYECEK, `#[serde(default = ...)]` sayesinde eksik alan
        // varsayılana düşecek — bu test o garantiyi doğruluyor (bugün
        // TEK alan olsa da, boş obje "{}" ile aynı senaryo).
        assert_eq!(parse_settings("{}"), AppSettings::default());
    }
}
