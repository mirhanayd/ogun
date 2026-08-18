'use client'

import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { authClient } from '@/lib/auth-client'
import { isNativeShell, loadNativeSessionToken } from '@/lib/native-shell'

// GitHub issue #52 / Prompt 9.2 — bu bileşen app/layout.tsx'e (kök layout,
// TÜM sayfaları sarar) eklendi ve iki şeyi yapar:
//
// GÖREV 3 (oturum kalıcılığı): native kabukta, çocuklar (yani gerçek uygulama
// — giriş sayfası dahil) render edilmeden ÖNCE Tauri'nin güvenli
// depolamasında saklı bearer token'ı okuyup auth-client.ts'in önbelleğine
// yükler (bkz. native-shell.ts loadNativeSessionToken). Bu SIRALAMA önemli:
// aksi halde ilk `getSession()` çağrısı token henüz yüklenmeden gidebilir ve
// kullanıcı, aslında oturumu AÇIKKEN kısa süreliğine "çıkış yapılmış" gibi
// görünen bir ekranla karşılaşabilir. Web tarayıcısında (isNativeShell()
// false) bu adım tamamen atlanır — çerez tabanlı oturum zaten anında
// hazırdır, ekstra bir bekleme YOKTUR.
//
// GÖREV 1 (OAuth deep link köprüsü): apps/desktop/src-tauri/src/deep_link.rs
// ogun://auth/callback?ott=... deep link'ini yakalayıp `ogun-oauth-callback`
// Tauri olayını (event) { oneTimeToken } payload'ıyla YAYINLAR (emit). Burada
// o olay dinlenir, token authClient.oneTimeToken.verify() ile GERÇEK bir
// oturuma çevrilir (bu çağrı hem oturum çerezini bu webview'e YAZAR hem de
// auth-client.ts'teki onSuccess kancasını tetikleyerek bearer token'ı
// stronghold'a KALICI olarak yazar) ve kullanıcı /kurulum'a yönlendirilir —
// e-posta+şifre girişindeki (giris/page.tsx) BAŞARI hedefiyle AYNI.
export function NativeAuthBridge({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(() => !isNativeShell())

  useEffect(() => {
    if (!isNativeShell()) return

    let cancelled = false
    void loadNativeSessionToken().finally(() => {
      if (!cancelled) setReady(true)
    })

    const unlistenPromise = listen<{ oneTimeToken: string }>('ogun-oauth-callback', (event) => {
      void (async () => {
        const { error } = await authClient.oneTimeToken.verify({
          token: event.payload.oneTimeToken,
        })
        // Token tek kullanımlıktır ve zaten tüketildi (başarılı ya da
        // değil) — ott'yi ASLA konsola/hata mesajına YAZMIYORUZ (güvenlik
        // kuralı). Sonuca göre kullanıcıyı ilgili sayfaya yönlendiriyoruz;
        // tam sayfa navigasyon KASITLI (React Query/oturum önbelleğini
        // sıfırdan, taze bir oturumla başlatır).
        window.location.href = error ? '/giris?hata=google-girisi-basarisiz' : '/kurulum'
      })()
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  if (!ready) return null

  return <>{children}</>
}
