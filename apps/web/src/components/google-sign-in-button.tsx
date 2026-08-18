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
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        veya
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={handleClick}>
          {pending ? 'Yönlendiriliyor…' : 'Google ile devam et'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}
