import { auth } from '@/lib/auth'

// GitHub issue #52 / Prompt 9.2, GÖREV 1 — "Native kimlik doğrulama akışı",
// sistem tarayıcısı ↔ masaüstü uygulaması köprüsü.
//
// AKIŞ: apps/web/src/components/google-sign-in-button.tsx, native kabukta
// çalışırken `signIn.social({ provider: 'google', callbackURL: BU_ROUTE })`
// çağırır. Google girişi (navigation.rs'teki #51 on_navigation engelleyicisi
// sayesinde) SİSTEM TARAYICISINDA açılır. Google'dan dönüşte Better Auth'un
// KENDİ `/api/auth/callback/google` handler'ı oturum çerezini bu isteğin
// (hâlâ sistem tarayıcısındaki) origin'ine YAZAR ve callbackURL olarak BU
// route'a yönlendirir — yani bu isteğe geldiğimizde oturum çerezi ZATEN
// mevcuttur (aynı origin, aynı tarayıcı sekmesi).
//
// Bu route'un TEK işi: o çerezle doğrulanmış oturumu KULLANARAK kısa ömürlü,
// tek kullanımlık bir "one-time-token" (ott) üretmek ve masaüstü uygulamasını
// ogun://auth/callback?ott=... deep link'i ile geri çağırmak. OS bu özel
// şemayı Öğün uygulamasına yönlendirir (bkz. apps/desktop/src-tauri/src/
// deep_link.rs) — bağlantı, kullanıcının "Öğün'ü aç?" onayı GEREKTİREBİLİR
// (tarayıcıların özel URL şemaları için standart davranışı, bir HATA
// DEĞİLDİR — bkz. docs/desktop-native-auth-manual-testing.md).
//
// GÜVENLİK KARARI (PR açıklamasında tekrarlanıyor, review'da özellikle
// bakılmalı): gerçek/uzun ömürlü oturum tokenı BURADA HİÇBİR ZAMAN URL'e
// konulmaz — deep link'e konan DEĞER, auth.ts'teki oneTimeToken() eklentisi
// tarafından üretilen, varsayılan 3 dakikada süresi dolan VE bir kez
// kullanıldıktan sonra sunucu tarafında TÜKETİLEN (bkz. better-auth
// one-time-token eklentisi consumeVerificationValue) opak bir değerdir.
// Bu; tarayıcı geçmişinde, işletim sistemi süreç listesinde ya da OS
// düzeyinde deep-link loglarında bu değerin görülmesi ihtimaline karşı
// (URL'e konan HER değer için var olan, kaçınılmaz bir risk) etkiyi
// "en fazla 3 dakika, tek kullanımlık bir işlem başlatma izni" ile
// sınırlar — kalıcı bir hesap ele geçirme aracı DEĞİLDİR. Masaüstü
// uygulaması bu token'ı /api/auth/one-time-token/verify'a POST ederek
// GERÇEK oturumu (hem çerez hem de auth.ts'teki bearer() eklentisiyle
// üretilen, stronghold'a yazılacak bearer token'ı) alır.
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session) {
    return deepLinkRedirect('ogun://auth/callback', { error: 'no_session' })
  }

  try {
    const { token } = await auth.api.generateOneTimeToken({ headers: request.headers })
    return deepLinkRedirect('ogun://auth/callback', { ott: token })
  } catch {
    // Token üretimi (beklenmedik şekilde) başarısız olursa kullanıcıyı
    // yine de uygulamaya geri döndürüyoruz ki sonsuza kadar tarayıcı
    // sekmesinde asılı KALMASIN — hata detayını (potansiyel olarak
    // hassas) URL'e KOYMUYORUZ, sadece jenerik bir hata kodu.
    return deepLinkRedirect('ogun://auth/callback', { error: 'token_generation_failed' })
  }
}

// NextResponse.redirect(url) yerine düz bir Response kullanıyoruz: o
// yardımcı, hedefi `new URL(url, requestBaseURL)` ile çözer ve http(s)
// DIŞINDAKİ şemalar için davranışı Next.js sürümleri arasında dokümante
// EDİLMEMİŞTİR — burada tam ne olacağını KENDİMİZ garanti etmek için
// Location başlığını doğrudan, tam (absolute) bir ogun:// URL'i olarak
// yazıyoruz.
function deepLinkRedirect(base: string, params: Record<string, string>): Response {
  const query = new URLSearchParams(params).toString()
  return new Response(null, {
    status: 302,
    headers: { Location: `${base}?${query}` },
  })
}
