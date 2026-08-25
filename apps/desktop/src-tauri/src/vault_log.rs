//! GEÇİCİ TANI GÜNLÜĞÜ — 0.2.8'de "PIN oluşturulamadı" hatasının gerçek
//! nedenini kullanıcının makinesinde YERİNDEN yakalamak için eklendi. Kök
//! neden bulunup düzeltildiğinde bu modül ve çağrı noktaları TAMAMIYLA
//! kaldırılacak.
//!
//! Kasa komutlarının giriş meta bilgisi, karar noktaları (özellikle
//! `is_online_app`'ın pencere URL'sinden ne anladığı) ve nihai sonuçları
//! `%LOCALAPPDATA%\app.ogun.desktop\vault-debug.log` dosyasına yazar.
//!
//! HASSAS VERİ KURALI: PIN'ler, oturum token'ları ve kasa İÇERİĞİ asla
//! günlüğe yazılmaz — yalnızca uzunluk (`newPinUzunluk=4`) ya da var-yok
//! (`currentPinVar=true`) gibi meta bilgiler. Bu kural secure_storage.rs'teki
//! tanı araçlarında izlenen kuralın aynısıdır.
//!
//! Her süreç başlangıcında dosya SIFIRLANIR: tanı akışı "kur → yeniden
//! üret → günlüğü oku" olduğu için dosyanın TEK bir oturumu anlatması,
//! eski oturumların karışmasıyla uğraşmaktan daha değerlidir.

use std::{
    io::Write,
    path::PathBuf,
    sync::OnceLock,
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

/// Süreç başlangıcına göre günlük satırlarındaki göreli zaman damgası.
fn start_time() -> &'static Instant {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now)
}

fn log_file_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join("vault-debug.log"))
}

/// Oturum başlangıcı: önceki oturumun satırlarını atıp başlık yazar.
/// Günlük yolunun çözümlenemediği (teorik) durumda sessizce hiçbir şey
/// yapmaz — tanı aracı uygulamanın çalışmasını ASLA engellememeli.
pub fn session_start(app: &AppHandle) {
    let Some(path) = log_file_path(app) else {
        return;
    };
    if let Err(_err) = std::fs::write(&path, b"") {
        // Dosya kilitli olabilir (aynı anda ikinci süreç?) — yazmaya
        // devam etmeye çalışmak yerine sessizce geç; append aşağıda da
        // başarısız olursa zaten hiçbir şey kaybolmaz.
    }
    log(
        app,
        format!(
            "=== Öğün masaüstü oturumu başladı (v{}) ===",
            env!("CARGO_PKG_VERSION")
        ),
    );
}

/// Tek satırlık bir tanı kaydı yazar (zaman damgalı, append).
pub fn log(app: &AppHandle, message: impl AsRef<str>) {
    const MAX_BYTES: u64 = 4 * 1024 * 1024;
    let Some(path) = log_file_path(app) else {
        return;
    };
    // Aşırı büyümüş günlüğe yazmayı bırak — döngüsel bir hata buraya
    // saniyelerce kayıt yazabilir; tanı aracının kendisi diski doldurmamalı.
    if std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0) > MAX_BYTES {
        return;
    }
    let elapsed = start_time().elapsed().as_secs_f64();
    let epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis())
        .unwrap_or(0);
    let line = format!("[+{elapsed:.3}s epoch={epoch_ms}] {}\n", message.as_ref());
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = file.write_all(line.as_bytes());
    }
}

/// Bir komut sonucunun ✓/✗ kaydını yazan küçük yardımcı. Sonucu DEĞİŞTİRMEZ.
pub fn log_result<T>(app: &AppHandle, name: &str, outcome: &Result<T, String>) {
    match outcome {
        Ok(_) => log(app, format!("{name} ✓")),
        Err(err) => log(app, format!("{name} ✗ hata: {err}")),
    }
}
