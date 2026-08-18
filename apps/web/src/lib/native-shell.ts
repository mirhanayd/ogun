import { invoke } from '@tauri-apps/api/core'

// GitHub issue #52 / Prompt 9.2 — apps/web AYNI JS paketi hem düz tarayıcıda
// (web) hem de Tauri'nin masaüstü webview'i (apps/desktop) içinde çalışır
// (bkz. faz-9-masaustu-kabugu.md'deki MİMARİ notu: Tauri apps/web'in kod
// tabanını SARAR, ayrı bir istemci DEĞİLDİR). Bu modül, "şu an native kabuk
// içinde miyiz" ayrımını YAPAN ve native'e özgü davranışları (bearer token
// ile oturum kalıcılığı, Google girişi için farklı callbackURL) apps/web'in
// GERİ KALANINDAN izole eden TEK nokta — böylece auth.ts/auth-client.ts gibi
// paylaşılan dosyalar Tauri'ye dair varsayım İÇERMEZ, sadece bu modülün
// saf (Tauri çalışma zamanı gerektirmeyen) yardımcı fonksiyonlarını çağırır.
//
// GÜVENLİK NOTU: `@tauri-apps/api` düz tarayıcıda da SORUNSUZ import edilir
// (yalnızca invoke/listen ÇAĞRILDIĞINDA, Tauri köprüsü yoksa reddeder) —
// ama biz yine de her çağrıyı isNativeShell() ile koruyoruz ki normal web
// ziyaretçileri için hiçbir ağ/IPC isteği YAPILMASIN.

/**
 * Bu sayfa şu an Tauri'nin masaüstü webview'i İÇİNDE mi çalışıyor?
 *
 * Tauri v2'de `window.__TAURI_INTERNALS__` her zaman mevcuttur (tauri.conf.json
 * `app.withGlobalTauri` AÇIK olsun olmasın — o ayar sadece `window.__TAURI__`
 * global'ini etkiler, `@tauri-apps/api`'nin kendi iç taşıma katmanını DEĞİL).
 * Bu yüzden bu kontrol, paket bağımlılığı gerektirmeyen, resmi olarak
 * dokümante edilen "Tauri içinde miyim" testidir.
 */
export function isNativeShell(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// GitHub issue #52 / Prompt 9.2, GÖREV 1 — Google girişi başlatıldığında
// hangi callbackURL/errorCallbackURL kullanılacağı. Web'de mevcut davranış
// AYNEN korunur (bkz. giris/page.tsx'in e-posta+şifre akışındaki /kurulum
// yönlendirmesiyle PARALEL). Native'de Better Auth'un OAuth callback'i
// KENDİ origin'imizdeki köprü route'una (apps/web/src/app/api/auth/native/
// callback/route.ts) yönlenir; o route oturumu kısa ömürlü bir "ott"ye
// çevirip ogun://auth/callback deep link'ine yönlendirir (bkz. o dosyanın
// başındaki yorum). Bu fonksiyon SAF'tır (Tauri çalışma zamanı gerektirmez),
// bu yüzden ayrıca birim testi var (native-shell.test.ts).
export function getGoogleSignInRedirects(): { callbackURL: string; errorCallbackURL: string } {
  if (isNativeShell()) {
    return {
      callbackURL: '/api/auth/native/callback',
      errorCallbackURL: '/api/auth/native/callback',
    }
  }
  return { callbackURL: '/kurulum', errorCallbackURL: '/giris' }
}

// ---------------------------------------------------------------------------
// GÖREV 3 — oturum kalıcılığı: Tauri'nin güvenli depolaması (stronghold,
// bkz. apps/desktop/src-tauri/src/secure_storage.rs) üzerinden bearer
// oturum token'ı sakla/oku/sil. Bu üç fonksiyon apps/desktop'ta tanımlı
// ÖZEL (`#[tauri::command]`) komutları çağırır — genel amaçlı stronghold
// eklenti komutları (initialize/save_store_record/...) DEĞİL, bilinçli
// olarak dar kapsamlı 3 komut (bkz. secure_storage.rs dosya başı notu).
// ---------------------------------------------------------------------------

/**
 * Bellek içi bearer token önbelleği. better-auth istemcisinin
 * `fetchOptions.auth.token` alıcısı SENKRON/hızlı çağrılabilmesi için
 * (her istek öncesi) burada tutulur; gerçek kaynağı (stronghold) sadece
 * `loadNativeSessionToken()` ile (uygulama açılışında BİR KEZ) okunur.
 */
let cachedSessionToken: string | undefined

export function getCachedNativeSessionToken(): string | undefined {
  return cachedSessionToken
}

/**
 * Uygulama açılışında (bkz. native-auth-bridge.tsx) stronghold'dan daha
 * önce saklanmış oturum token'ını okur ve önbelleğe alır — "uygulama
 * kapatılıp açıldığında otomatik oturum devam etsin" (issue #52 GÖREV 3)
 * gereksinimi budur. Native kabuk DIŞINDA no-op.
 */
export async function loadNativeSessionToken(): Promise<string | undefined> {
  if (!isNativeShell()) return undefined
  try {
    const token = await invoke<string | null>('load_session_token')
    cachedSessionToken = token ?? undefined
  } catch (err) {
    // Depolama henüz hiç yazılmamış olabilir (ilk kurulum) — bu bir hata
    // DEĞİL, sadece "kayıtlı oturum yok" anlamına gelir. Token'ı hiç
    // KONSOLA YAZMIYORUZ (güvenlik kuralı) — sadece hatayı.
    console.warn('[native-shell] saklanan oturum token\'ı okunamadı', err)
    cachedSessionToken = undefined
  }
  return cachedSessionToken
}

/**
 * better-auth'un `bearer` eklentisinin her başarılı auth isteğinde eklediği
 * `set-auth-token` yanıt başlığını yakalayıp kalıcı olarak saklar (bkz.
 * auth-client.ts `onSuccess` kancası). Native kabuk DIŞINDA no-op.
 *
 * GitHub issue #52 / Prompt 9.2, kod incelemesi (PR #56) — PERFORMANS: bu
 * `set-auth-token` başlığı SADECE ilk girişte değil, better-auth'un rutin
 * oturum çerezi yenilemelerinde de (normal kullanım sırasında sıkça) YENİDEN
 * gönderilir. Değer ÖNCEKİYLE AYNIYSA `store_session_token` IPC çağrısını
 * (bu da tam bir Argon2 anahtar türetimi + Stronghold snapshot açma/
 * kaydetme demektir) HİÇ YAPMIYORUZ — gereksiz CPU/disk maliyetini önler.
 */
export async function persistNativeSessionToken(token: string): Promise<void> {
  const unchanged = cachedSessionToken === token
  cachedSessionToken = token
  if (!isNativeShell() || unchanged) return
  try {
    await invoke('store_session_token', { token })
  } catch (err) {
    console.warn('[native-shell] oturum token\'ı güvenli depolamaya yazılamadı', err)
  }
}

/**
 * Çıkış yapıldığında (bkz. gelecekteki "çıkış yap" akışı) saklanan token'ı
 * temizler. Native kabuk DIŞINDA no-op.
 */
export async function clearNativeSessionToken(): Promise<void> {
  cachedSessionToken = undefined
  if (!isNativeShell()) return
  try {
    await invoke('clear_session_token')
  } catch (err) {
    console.warn('[native-shell] oturum token\'ı güvenli depolamadan silinemedi', err)
  }
}
