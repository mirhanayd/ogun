// Öğün masaüstü kabuğu — ince giriş noktası. Gerçek kurulum lib.rs'te
// (Tauri 2'nin mobil hedefler için de kullanılabilen standart deseni:
// main.rs SADECE `run()`'ı çağırır, tüm mantık kütüphanede yaşar).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ogun_desktop_lib::run();
}
