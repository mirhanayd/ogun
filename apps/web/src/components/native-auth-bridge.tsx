'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
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
// ogun://auth/callback?ott=... (başarı) YA DA ?error=... (başarısızlık) deep
// link'ini yakalayıp `ogun-oauth-callback` Tauri olayını (event) YAYINLAR
// (emit). Burada o olay dinlenir: başarılıysa token authClient.oneTimeToken.
// verify() ile GERÇEK bir oturuma çevrilir (bu çağrı hem oturum çerezini bu
// webview'e YAZAR hem de auth-client.ts'teki onSuccess kancasını tetikleyerek
// bearer token'ı stronghold'a KALICI olarak yazar) ve kullanıcı /kurulum'a
// yönlendirilir — e-posta+şifre girişindeki (giris/page.tsx) BAŞARI
// hedefiyle AYNI. Başarısızsa (Rust'tan gelen ?error=... YA DA verify()'ın
// kendisi başarısız olursa) kullanıcı /giris?hata=...'ya yönlendirilir —
// giris/page.tsx bunu okuyup bir hata bildirimi (toast) gösterir (bkz. kod
// incelemesi PR #56: bu yol daha önce hiç ele alınmıyordu, "Google ile devam
// et" düğmesi sonsuza kadar "Yönlendiriliyor…" durumunda TAKILI kalıyordu —
// tam sayfa navigasyon bu sorunu da ÇÖZER, çünkü düğmenin bileşen-yerel
// `pending` state'i navigasyonla birlikte sıfırdan mount olur).
//
// `notify_frontend_ready` KOMUTU (kod incelemesi PR #56): Rust tarafı
// (deep_link.rs) bir OAuth geri dönüşünü bu bileşenin `listen(...)` KAYDI
// TAMAMLANMADAN yayınlarsa olay sessizce KAYBOLUR (Tauri geç abonelere olay
// TAMPONLAMAZ) — soğuk başlangıçta (React henüz mount olmamışken) bu GERÇEK
// bir risktir. `listen(...)` Promise'i ÇÖZÜLDÜKTEN (yani dinleyici Rust
// tarafında KAYITLI OLDUKTAN) hemen sonra bu komutu çağırıyoruz; Rust
// tarafında bu andan ÖNCE gelmiş, bekletilmiş (`PendingDeepLink`) bir OAuth
// geri dönüşü varsa HEMEN drenaj edilip aynı olay üzerinden bize ulaşır.
//
// HYDRATION UYUMSUZLUĞU DÜZELTMESİ (kod incelemesi PR #56): `ready`'nin
// başlangıç değeri SUNUCUDA (isNativeShell() her zaman false — window yok)
// ve İSTEMCİNİN İLK render'ında (native kabukta window.__TAURI_INTERNALS__
// DAHA O ANDA mevcut) FARKLI hesaplanıyordu — bu React'in "sunucu ve istemci
// ilk render'ı AYNI çıktıyı üretmeli" kuralını ihlal eden gerçek bir
// hydration uyumsuzluğuydu (görünür bir flaş + konsol uyarısı). Çözüm:
// başlangıç değeri HER ZAMAN (SSR dahil) sabit `true` — native'e özgü
// gerçek "hazır mı" durumu SADECE istemci-taraflı `useEffect` İÇİNDE
// (hydration TAMAMLANDIKTAN sonra) hesaplanıp uygulanıyor.
export function NativeAuthBridge({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(true)

  useEffect(() => {
    if (!isNativeShell()) return

    // Native kabukta: token yüklenene kadar çocukları GİZLE (bkz. yukarıdaki
    // GÖREV 3 notu). SSR/ilk render ile uyumsuzluk YARATMAZ çünkü bu satır
    // useEffect İÇİNDE — yalnızca istemci tarafında, hydration bittikten
    // SONRA çalışır.
    setReady(false)

    let cancelled = false
    void loadNativeSessionToken().finally(() => {
      if (!cancelled) setReady(true)
    })

    const unlistenPromise = listen<
      { status: 'ok'; oneTimeToken: string } | { status: 'error'; message: string }
    >('ogun-oauth-callback', (event) => {
      void (async () => {
        if (event.payload.status === 'error') {
          window.location.href = `/giris?hata=${encodeURIComponent(event.payload.message)}`
          return
        }
        const { error } = await authClient.oneTimeToken.verify({
          token: event.payload.oneTimeToken,
        })
        // Token tek kullanımlıktır ve zaten tüketildi (başarılı ya da
        // değil) — ott'yi ASLA konsola/hata mesajına YAZMIYORUZ (güvenlik
        // kuralı). Sonuca göre kullanıcıyı ilgili sayfaya yönlendiriyoruz;
        // tam sayfa navigasyon KASITLI (React Query/oturum önbelleğini
        // sıfırdan, taze bir oturumla başlatır — ve "Google ile devam et"
        // düğmesinin pending durumunu da doğal olarak sıfırlar).
        // GitHub issue #67 — başarıda /kurulum DEĞİL /panel (bkz. giris/page.tsx
        // ve native-shell.ts'teki aynı düzeltme): kliniği olan kullanıcı
        // sihirbaza düşmemeli, kliniksiz olan zaten layout'ta yönlendiriliyor.
        window.location.href = error ? '/giris?hata=google-girisi-basarisiz' : '/panel'
      })()
    })

    void unlistenPromise.then(() => {
      // bkz. yukarıdaki "notify_frontend_ready KOMUTU" notu — dinleyici
      // ARTIK kayıtlı, Rust'a haber ver.
      void invoke('notify_frontend_ready')
    })

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  if (!ready) return null

  return <>{children}</>
}
