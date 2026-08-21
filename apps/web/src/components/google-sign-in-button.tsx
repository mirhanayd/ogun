'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { getGoogleSignInRedirects } from '@/lib/native-shell'

// GitHub issue #52 / Prompt 9.2, GÖREV 1 — "Native kimlik doğrulama akışı".
//
// NEDEN BU BİLEŞEN YENİ: apps/web/src/lib/auth.ts'te Google OAuth sağlayıcısı
// zaten yapılandırılıydı (bkz. GitHub issue #10/#13) ama giriş/kayıt
// sayfalarında bunu TETİKLEYEN bir buton hiç YOKTU — yani Google girişi hem
// web'de hem masaüstünde fiilen ERİŞİLEMEZDİ. Bu issue'nun temel önkoşulu
// ("sistem tarayıcısında OAuth") bu buton olmadan test edilemeyeceği için
// eklenmesi GENUINELY REQUIRED (bkz. PR açıklamasındaki bilinçli karar notu)
// — giris/page.tsx ve kayit/page.tsx'e sadece BU bileşenin import+kullanım
// satırları eklendi, mevcut e-posta+şifre formlarının kod/mantığı DEĞİŞMEDİ.
//
// Web'de ve native kabukta AYNI kod çalışır, farklılık SADECE callbackURL
// seçiminde (bkz. native-shell.ts getGoogleSignInRedirects) — geri kalan
// her şey (sistem tarayıcısında açılma) apps/desktop/src-tauri/src/
// navigation.rs'teki MEVCUT #51 on_navigation engelleyicisinden BEDAVA gelir:
// better-auth istemcisi `signIn.social()` başarılı olduğunda
// `window.location.href = <google-yetkilendirme-url'i>` atar (bkz.
// node_modules/better-auth/dist/client/fetch-plugins.mjs redirectPlugin) —
// bu, kendi origin'imiz DIŞINDA bir https navigasyonu olduğundan
// on_navigation tarafından YAKALANIP sistem tarayıcısına yönlendirilir ve
// pencere içi navigasyon İPTAL edilir. Burada EK bir şey yapmaya gerek YOK.
//
// Kod incelemesi (PR #56) notu: "veya" ayırıcısı (divider) giris/page.tsx
// ve kayit/page.tsx'te AYNI şekilde tekrarlanıyordu — buraya, bileşenin
// KENDİSİNE taşındı (dışa aktarılan tek şey artık BU bileşen, ayırıcı ayrı
// bir markup parçası olarak İKİ yerde bakım gerektirmiyor).
export function GoogleSignInButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    setPending(true)
    const { callbackURL, errorCallbackURL } = getGoogleSignInRedirects()
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL,
      errorCallbackURL,
    })
    if (error) {
      setError(error.message ?? 'Google ile giriş başlatılamadı, lütfen tekrar deneyin.')
      setPending(false)
    }
    // Hata yoksa better-auth istemcisi sayfayı zaten Google'a yönlendirir
    // (yukarıdaki not) — burada başka bir şey yapmıyoruz, pending durumu
    // sayfa ayrılana kadar (ya da native'de sistem tarayıcısı açılana
    // kadar) düğmeyi devre dışı bırakmak için kasıtlı olarak sıfırlanmıyor.
    // (Native'de OAuth başarısız olursa tam sayfa navigasyonla bu bileşen
    // sıfırdan mount olur, bkz. native-auth-bridge.tsx — pending "takılı"
    // kalmaz.)
  }

  return (
    <div>
      <div className="my-6 flex items-center gap-3 text-[0.6875rem] font-medium tracking-[0.12em] text-muted-foreground uppercase">
        <span className="h-px flex-1 bg-border" />
        veya
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl bg-card text-sm shadow-xs"
          disabled={pending}
          onClick={handleClick}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5">
            <path
              fill="#4285F4"
              d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 4.98-.9 6.63-2.38l-3.24-2.53c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.39 13.92A6.02 6.02 0 0 1 6.08 12c0-.67.12-1.32.31-1.92v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.52l3.35-2.6Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.35 2.6C7.18 7.71 9.39 5.95 12 5.95Z"
            />
          </svg>
          {pending ? 'Yönlendiriliyor…' : 'Google ile devam et'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
