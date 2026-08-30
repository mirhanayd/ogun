import { invoke } from '@tauri-apps/api/core'
import { cloudUrl, getOgunCloudOrigin } from './cloud-origin'

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

// Web tarayıcısındaki standart Google akışının dönüş hedefleri. Native akış
// bunu çağırmaz; state çerezinin sistem tarayıcısında oluşturulması için
// getNativeGoogleSignInURL() ile ayrı başlangıç route'una gider.
export function getGoogleSignInRedirects(): { callbackURL: string; errorCallbackURL: string } {
  // GitHub issue #67 — e-posta+şifre girişiyle AYNI hedef: /panel. Google ile
  // giren kullanıcının da kliniği çoktan olabilir; (app)/layout.tsx zaten
  // kliniksiz kullanıcıyı /kurulum'a yönlendiriyor.
  return { callbackURL: '/panel', errorCallbackURL: '/giris' }
}

/**
 * Native OAuth must start in the system browser. Starting it in the webview
 * stores Better Auth's state cookie in a different cookie jar, so the callback
 * arriving in the browser cannot validate the state.
 */
export function getNativeGoogleSignInURL(): string {
  const baseURL = isNativeShell() ? getOgunCloudOrigin() : window.location.origin
  return new URL('/api/auth/native/google', baseURL).toString()
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
    console.warn("[native-shell] saklanan oturum token'ı okunamadı", err)
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
    console.warn("[native-shell] oturum token'ı güvenli depolamaya yazılamadı", err)
  }
}

export type NativeSessionExchangeResult =
  | { ok: true }
  | {
      ok: false
      reason: 'invalid-or-expired-token' | 'missing-session-token' | 'network-error'
    }

/**
 * Sistem tarayıcısından deep link ile gelen tek kullanımlık token'ı,
 * webview'in kendi oturumuna dönüştürür.
 *
 * Bu istek bilerek `authClient` üzerinden gitmez: authClient native kabukta
 * bellekteki mevcut bearer token'ı her isteğe ekler. Eski ya da süresi dolmuş
 * bir token'ın OAuth devir teslim isteğine karışmasını istemiyoruz. Ham,
 * aynı-origin fetch hem yeni oturum çerezini webview'e yazar hem de bearer
 * eklentisinin `set-auth-token` başlığını doğrudan okumamızı sağlar.
 * Kalıcı depolama tamamlanmadan başarı dönülmez; böylece hemen yapılan
 * sayfa navigasyonu Stronghold yazımını yarıda kesemez.
 */
export async function exchangeNativeOneTimeToken(
  oneTimeToken: string,
): Promise<NativeSessionExchangeResult> {
  try {
    const response = await fetch(cloudUrl('/api/auth/one-time-token/verify'), {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: oneTimeToken }),
    })

    if (!response.ok) {
      return { ok: false, reason: 'invalid-or-expired-token' }
    }

    const sessionToken = response.headers.get('set-auth-token')
    if (!sessionToken) {
      return { ok: false, reason: 'missing-session-token' }
    }

    await persistNativeSessionToken(sessionToken)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'network-error' }
  }
}

/**
 * Explicit logout removes both the native token and the active local profile.
 * Closing the application does not invoke this path, so offline access persists.
 */
export async function clearNativeSessionToken(): Promise<void> {
  cachedSessionToken = undefined
  if (!isNativeShell()) return
  try {
    // Kullanıcı açıkça çıkış yaptığında yerel PIN erişimi ve bu hesaba ait
    // klinik snapshot'ı da kaldırılır. Uygulamayı yalnızca kapatmak bu akışı
    // çağırmaz; kalıcı oturum ve çevrimdışı erişim korunur.
    await invoke('remove_active_offline_profile')
  } catch (err) {
    console.warn('[native-shell] çevrimdışı cihaz profili kaldırılamadı', err)
  }
  try {
    await invoke('clear_session_token')
  } catch (err) {
    console.warn("[native-shell] oturum token'ı güvenli depolamadan silinemedi", err)
  }
}

// ---------------------------------------------------------------------------
// GitHub issue #53 / Prompt 9.3, GÖREV 4 — "PDF indirme: tarayıcı indirme
// diyaloğu yerine native Farklı Kaydet." `@tauri-apps/plugin-dialog` /
// `@tauri-apps/plugin-fs` BURADA (yukarıdaki `invoke`'un aksine) DİNAMİK
// import edilir — bu dosya HEM native kabukta HEM düz tarayıcıda geniş
// çapta (birçok bileşen tarafından) import ediliyor; bu iki eklenti
// paketini tarayıcı kullanıcıları için başlangıç paketine (bundle)
// SOKMAMAK için `import()` ile kod bölme (code splitting) kullanılıyor —
// `@tauri-apps/api/core`'un aksine (o zaten @tauri-apps/api'nin KENDİSİ,
// her durumda gerekli), bu ikisi SADECE native kabukta gerçekten
// ÇAĞRILIYOR.
// ---------------------------------------------------------------------------

/**
 * Verilen byte'ları native "Farklı Kaydet" diyaloğuyla kullanıcının seçtiği
 * bir dosya yoluna yazar. `true` DÖNERSE dosya BAŞARIYLA kaydedildi —
 * çağıran taraf tarayıcı indirme yoluna (window.open/vb.) DÜŞMEMELİ.
 * `false` DÖNERSE (native kabuk DEĞİL, kullanıcı diyaloğu İPTAL etti, ya da
 * bir HATA oluştu) çağıran taraf KENDİ tarayıcı indirme yoluna düşmeli —
 * bu fonksiyon o yedek (fallback) davranışı KENDİSİ tetiklemez.
 */
export async function saveFileNatively(
  blob: Blob,
  suggestedFileName: string,
  filters: { name: string; extensions: string[] }[] = [],
): Promise<boolean> {
  if (!isNativeShell()) return false
  try {
    const [{ save }, { writeFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const targetPath = await save({ defaultPath: suggestedFileName, filters })
    if (!targetPath) return false // kullanıcı diyaloğu İPTAL etti
    const bytes = new Uint8Array(await blob.arrayBuffer())
    await writeFile(targetPath, bytes)
    return true
  } catch (err) {
    console.warn('[native-shell] dosya native olarak kaydedilemedi', err)
    return false
  }
}
