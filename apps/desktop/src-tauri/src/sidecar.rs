//! GitHub issue #51 / Prompt 9.1, GÖREV 1 — üretim paketleme.
//!
//! apps/web'in API route'ları ve server action'ları GERÇEK bir Node.js
//! sunucusu gerektirir (statik export YETERSİZ — bu, apps/web'in Better
//! Auth + Postgres + iyzico/Netgsm entegrasyonlarının sunucu tarafında
//! çalışmaya devam etmesi gereken mimari kararının doğrudan sonucu, bkz.
//! faz-9-masaustu-kabugu.md'deki "MİMARİ" notu). Bu yüzden üretimde Tauri,
//! apps/web'in `output: 'standalone'` çıktısını (bkz. apps/web/next.config.ts
//! ve apps/desktop/scripts/prepare-sidecar.mjs) yerel bir Node ALT SÜRECİ
//! ("sidecar") olarak başlatır ve hazır olduğunda pencereyi ona yönlendirir.
//!
//! KAPSAM NOTU (bkz. PR açıklaması): Tauri'nin `externalBin` mekanizması,
//! bu ikili dosyayı `src-tauri/binaries/app-server-<hedef-üçlü>(.exe)`
//! adında bekler. `prepare-sidecar.mjs`, bu scaffold'ı GERÇEKTEN test
//! edilebilir kılmak için ŞU ANKİ makinenin Node çalıştırılabilirini
//! kopyalayıp yeniden adlandırıyor — imzalı/optimize edilmiş, tüm hedef
//! platformlar için doğru Node dağıtımının (ya da `pkg`/Node SEA ile tek
//! dosyaya derlenmiş bir sürümün) seçilmesi issue #54'ün ("Paketleme,
//! imzalama ve dağıtım") kapsamı — burada spawn/port-poll/yönlendirme
//! MEKANİZMASININ KENDİSİ tam olarak çalışır durumda.

use tauri::{AppHandle, Emitter, Manager, Url, WebviewWindow};
use tauri_plugin_shell::{process::CommandEvent, ShellExt};
use tokio::net::TcpStream;
use tokio::time::{sleep, timeout, Duration};

use crate::navigation::AppOrigin;

/// apps/web standalone server.js'in dinleyeceği yerel adres. Sadece bu
/// makineden erişilebilsin diye `127.0.0.1`'e bağlanıyor (dış ağa AÇILMIYOR
/// — masaüstü uygulaması için doğru varsayılan, bkz. Dockerfile'daki
/// `HOSTNAME=0.0.0.0`'ın AKSİNE burada bilinçli olarak 127.0.0.1).
const SIDECAR_HOST: &str = "127.0.0.1";
const SIDECAR_PORT: u16 = 3000;
const READY_TIMEOUT: Duration = Duration::from_secs(20);
const POLL_INTERVAL: Duration = Duration::from_millis(200);

/// Node sidecar sürecini başlatır; TCP portu yanıt verir vermez ana
/// pencereyi (hâlâ splash sayfasını gösteren) o adrese yönlendirir.
///
/// Yalnızca üretim build'lerinde çağrılır (bkz. lib.rs — `tauri::is_dev()`
/// true iken devUrl zaten localhost:3000'e işaret ediyor, sidecar'a gerek
/// yok). `AppOrigin` bu fonksiyon çağrılmadan ÖNCE lib.rs'te `app.manage()`
/// ile bir kez kaydedilmiş olmalı — burada sadece mevcut örneğin değerini
/// güncelliyoruz (bkz. navigation.rs).
pub fn spawn_and_redirect(app: AppHandle, window: WebviewWindow) {
    tauri::async_runtime::spawn(async move {
        // `binaries/app-server` ikili dosyası, prepare-sidecar.mjs'in
        // kopyaladığı ÇIPLAK bir Node çalıştırılabilir dosyası (bkz. o
        // betiğin başındaki kapsam notu) — bu yüzden çalıştırılacak
        // server.js'in yolunu KENDİMİZ argüman olarak vermemiz gerekiyor.
        // Bu yol, `tauri.conf.json`'daki `bundle.resources` eşlemesiyle
        // (`resources/web-server` -> `resources/web-server`) ve
        // prepare-sidecar.mjs'in apps/web'in standalone çıktısını
        // kopyalama şekliyle (monorepo'daki göreli konum apps/web/
        // korunur, bkz. Dockerfile'daki aynı gözlem) BİREBİR eşleşmeli.
        let resource_dir = match app.path().resource_dir() {
            Ok(dir) => dir,
            Err(err) => {
                eprintln!("[ogun-desktop] kaynak dizini çözülemedi: {err}");
                return;
            }
        };
        let server_js = resource_dir.join("resources/web-server/apps/web/server.js");

        let shell = app.shell();
        let command = match shell.sidecar("app-server") {
            Ok(cmd) => cmd,
            Err(err) => {
                eprintln!("[ogun-desktop] app-server sidecar bulunamadı: {err}");
                return;
            }
        };

        let command = command
            .args([server_js.to_string_lossy().to_string()])
            .env("PORT", SIDECAR_PORT.to_string())
            .env("HOSTNAME", SIDECAR_HOST)
            .env("NODE_ENV", "production");

        let (mut rx, _child) = match command.spawn() {
            Ok(pair) => pair,
            Err(err) => {
                eprintln!("[ogun-desktop] app-server sidecar başlatılamadı: {err}");
                return;
            }
        };

        // Sidecar'ın stdout/stderr'ını tüketmeye devam et (Rust tarafında
        // kanal doluymuş gibi tıkanmasın diye ŞART) ve teşhis için terminale
        // yazdır — Node standalone server.js "Ready" satırını stdout'a
        // basar, ama biz hazır olma kontrolünü DAHA GÜVENİLİR olan TCP
        // port yoklamasıyla ayrıca yapıyoruz (aşağıda).
        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        eprintln!("[app-server] {}", String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Stderr(line) => {
                        eprintln!("[app-server:err] {}", String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Error(err) => {
                        eprintln!("[ogun-desktop] app-server hata bildirdi: {err}");
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!("[ogun-desktop] app-server sonlandı: {payload:?}");
                        break;
                    }
                }
            }
        });

        let address = format!("{SIDECAR_HOST}:{SIDECAR_PORT}");
        let became_ready = timeout(READY_TIMEOUT, async {
            loop {
                if TcpStream::connect(&address).await.is_ok() {
                    return;
                }
                sleep(POLL_INTERVAL).await;
            }
        })
        .await
        .is_ok();

        if !became_ready {
            eprintln!(
                "[ogun-desktop] app-server {READY_TIMEOUT:?} içinde {address} adresinde \
                 yanıt vermedi — splash sayfasında kalınıyor."
            );
            let _ = app.emit("ogun://sidecar-timeout", ());
            return;
        }

        let sidecar_origin = format!("http://{address}");
        app.state::<AppOrigin>().set(sidecar_origin.clone());

        let target_url = Url::parse(&format!("{sidecar_origin}/")).expect("geçerli sidecar URL'i");
        if let Err(err) = window.navigate(target_url) {
            eprintln!("[ogun-desktop] pencere sidecar adresine yönlendirilemedi: {err}");
        }
    });
}
