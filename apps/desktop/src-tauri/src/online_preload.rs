//! Splash görünürken çevrimiçi uygulamanın ARKA PLANDA ön yüklenmesi.
//!
//! KULLANICI RAPORU: "ilk açtığımda 4-5 saniyelik full beyaz ekran geliyor."
//! Kök neden: splash sayfası (yerel index.html) anında açılır ama
//! `location.href` ile Vercel'deki üretim uygulamasına geçildiği anda
//! webview, uzak sayfanın HTML'i + JS bundle'ları indirilip ilk boyama
//! yapılana kadar BEYAZ kalır — soğuk lambda + ağ gecikmesiyle bu kolayca
//! 4-5 saniyedir.
//!
//! ÇÖZÜM: splash GÖRÜNÜR kalırken aynı URL'yi gizli ikinci bir pencerede
//! açarız. WebView2 profili (HTTP disk önbelleği + bağlantı havuzu) tüm
//! pencereler arasında PAYLAŞILIR ve istek sunucu lambda'sını da ısıtır.
//! Gizli pencerenin yükleme olayı bitince ana pencere AYNI adres'e
//! gezinir — her şey önbellekten geldiği için beyaz boşluk birkaç yüz
//! milisaniyeye iner. Splash kartı bu sürede kullanıcıya markalı bir
//! "açılıyor" ekranı göstermeye devam eder.
//!
//! ZAMAN AŞIMI: ağ çok yavaşsa ya da yükleme olayı hiç gelmezse 8 saniye
//! sonra eski davranışa düşer (doğrudan gezinme) — kullanıcı asla takılı
//! kalmaz. Dev modunda yerel sunucu zaten hızlı olduğundan doğrudan gezinme
//! yapılır (ön yükleme YOK).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};

const PRELOAD_WINDOW_LABEL: &str = "ogun-online-preload";
const PREWARM_TIMEOUT: Duration = Duration::from_secs(8);

/// Tek uçuş kilidi: prewarm sürerken gelen ikinci `open_online_app` çağrısı
/// (örn. "Bağlantıyı kontrol et" düğmesine çift tıklama) yeni bir pencere
/// AÇMAZ; süren uçuşun kendi zaman aşımı işini tamamlamasına izin verilir.
#[derive(Default)]
pub struct OnlinePreloadState {
    in_flight: AtomicBool,
}

fn allowed_entry_url(raw: &str) -> Result<Url, String> {
    let url: Url = raw
        .parse()
        .map_err(|_| "Çevrimiçi giriş adresi geçersiz.".to_string())?;
    // Güvenlik: bu komut webview gezinmesini tetikler; yalnızca uygulamanın
    // KENDİ çevrimiçi origin'lerine izin ver. Üretim sabit Vercel origin'i,
    // dev ise localhost'tur (dev'de prewarm hiç çalışmasa da savunma katmanı
    // olarak kısıt her iki modda da uygulanır).
    let host_ok = match url.host_str() {
        Some("ogun-web.vercel.app") => url.scheme() == "https",
        Some("localhost") | Some("127.0.0.1") => tauri::is_dev() && url.scheme() == "http",
        _ => false,
    };
    if !host_ok {
        return Err("Bu adres çevrimiçi uygulama olarak açılamaz.".to_string());
    }
    Ok(url)
}

fn navigate_main(app: &AppHandle, url: &Url) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "Ana pencere bulunamadı.".to_string())?;
    main.navigate(url.clone())
        .map_err(|err| format!("Çevrimiçi uygulamaya geçilemedi: {err}"))
}

fn close_preload_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(PRELOAD_WINDOW_LABEL) {
        if let Err(err) = window.close() {
            eprintln!("[ogun-desktop] ön yükleme penceresi kapatılamadı: {err}");
        }
    }
}

#[tauri::command]
pub fn open_online_app(
    app: AppHandle,
    state: State<'_, OnlinePreloadState>,
    entry_url: String,
) -> Result<(), String> {
    let url = allowed_entry_url(&entry_url)?;

    if tauri::is_dev() {
        // Dev'de next dev zaten hızlı; prewarm yerine doğrudan geç.
        return navigate_main(&app, &url);
    }

    // Süren bir uçuş varsa yeni pencere açma; mevcut uçuşun zaman aşımı
    // veya yükleme olayı geçişi halledecek.
    if state
        .in_flight
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(());
    }

    // Per-flight tamamlanma bayrağı: yükleme olayı ile zaman aşımı ipliginin
    // İKİSİ de geçişi tetiklemesin (çift gezinme, kullanıcının yazdığı
    // formu yeniden yükleyebilir).
    let done = Arc::new(AtomicBool::new(false));

    let page_load_app = app.clone();
    let page_load_url = url.clone();
    let page_load_done = done.clone();

    let preload = WebviewWindowBuilder::new(
        &app,
        PRELOAD_WINDOW_LABEL,
        WebviewUrl::External(url.clone()),
    )
    .title("Öğün")
    .visible(false)
    .decorations(false)
    // Görev çubuğunda asla görünmesin — kullanıcı bunu bir pencere olarak
    // değil, splash'in arkasındaki hazırlık olarak hissetmeli.
    .skip_taskbar(true)
    .inner_size(1280.0, 800.0)
    .on_page_load(move |_preloading_window, event| {
        if event.event() != tauri::webview::PageLoadEvent::Finished {
            return;
        }
        // compare_exchange: İLK Finished kazanan olur.
        if page_load_done
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }
        // İçerik artık önbellekte; ana pencereyi geçirip gizli pencereyi
        // kaldır. Geçiş burada başarısız olsa bile zaman aşımı ipliği
        // en fazla 8 saniye sonra kilidi serbest bırakır; kullanıcı
        // "Bağlantıyı kontrol et" ile yeniden deneyebilir.
        if let Err(err) = navigate_main(&page_load_app, &page_load_url) {
            eprintln!("[ogun-desktop] ön yükleme sonrası geçiş başarısız: {err}");
        }
        close_preload_window(&page_load_app);
    })
    .build()
    .map_err(|err| {
        // Pencere açılamadıysa kilidi bırak ve eski davranışa düş.
        state.in_flight.store(false, Ordering::Release);
        format!("Ön yükleme penceresi açılamadı: {err}")
    })?;

    // Pencere başarılı kuruldu; artık yerel bağlantıya gerek yok.
    drop(preload);

    let timeout_app = app.clone();
    let timeout_url = url;
    let timeout_done = done;
    std::thread::spawn(move || {
        std::thread::sleep(PREWARM_TIMEOUT);
        // Zaman aşımı: yükleme olayı hiç gelmediyse ESKİ davranışa düş —
        // doğrudan gezinme. Kullanıcı en kötü durumda bugünkü beyaz ekranı
        // görür ama asla takılı kalmaz.
        if timeout_done
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
        {
            eprintln!("[ogun-desktop] ön yükleme zaman aşımına uğradı, doğrudan geçiliyor");
            if let Err(err) = navigate_main(&timeout_app, &timeout_url) {
                eprintln!("[ogun-desktop] zaman aşımı geçişi başarısız: {err}");
            }
            close_preload_window(&timeout_app);
        }
        timeout_app
            .state::<OnlinePreloadState>()
            .in_flight
            .store(false, Ordering::Release);
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_apps_own_origins_are_allowed() {
        assert!(allowed_entry_url("https://ogun-web.vercel.app/giris").is_ok());
        // Üretim origin'inin http'ye düşürülmesi reddedilir.
        assert!(allowed_entry_url("http://ogun-web.vercel.app/giris").is_err());
        // Yabancı origin'ler asla gezinemez.
        assert!(allowed_entry_url("https://evil.example.com/giris").is_err());
        assert!(allowed_entry_url("file:///C:/Windows/system32").is_err());
        assert!(allowed_entry_url("bu bir url değil").is_err());
    }

    #[cfg(not(debug_assertions))]
    #[test]
    fn localhost_is_rejected_outside_dev_builds() {
        // Release derlemede localhost kabul EDİLMEZ (tauri::is_dev() false
        // döner); dev modunda tersine yerel sunucu beklenir.
        assert!(allowed_entry_url("http://localhost:3000/giris").is_err());
    }
}
