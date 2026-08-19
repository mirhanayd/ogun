'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { authClient } from '@/lib/auth-client'
import { loginSchema, type LoginFormValues } from '@/lib/validation/auth-schemas'

// GitHub issue #52 / Prompt 9.2, kod incelemesi (PR #56) — native Google
// girişi başarısız olursa (bkz. native-auth-bridge.tsx) kullanıcı buraya
// `?hata=<kod>` ile geri döner. `window.location.search`'ten (useSearchParams
// DEĞİL — bu, sayfayı bir Suspense sınırına ayırma ZORUNLULUĞU getirirdi,
// bkz. sifre-sifirla/page.tsx; burada tek seferlik, mount-anı bir okuma
// yeterli) okuyup anlaşılır bir Türkçe bildirim (toast) gösteriyoruz.
const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  'google-girisi-basarisiz': 'Google ile giriş tamamlanamadı, lütfen tekrar deneyin.',
  no_session: 'Google girişi tamamlanamadı (oturum bulunamadı), lütfen tekrar deneyin.',
  token_generation_failed: 'Google girişi tamamlanamadı, lütfen tekrar deneyin.',
}

export default function GirisPage() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    const hata = new URLSearchParams(window.location.search).get('hata')
    if (!hata) return
    toast.error(GOOGLE_ERROR_MESSAGES[hata] ?? 'Google ile giriş tamamlanamadı, lütfen tekrar deneyin.')
    // URL'deki ?hata= parametresini temizle — sayfa yenilendiğinde/geri
    // gidildiğinde bildirim TEKRAR gösterilmesin.
    router.replace('/giris')
  }, [router])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(values: LoginFormValues) {
    setFormError(null)
    const { error } = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    })
    if (error) {
      setFormError(
        error.status === 401
          ? 'E-posta veya şifre hatalı.'
          : (error.message ?? 'Giriş yapılamadı, lütfen tekrar deneyin.'),
      )
      return
    }
    // GitHub issue #67 — GİRİŞ sonrası hedef /kurulum DEĞİL /panel. Buraya
    // gelen kullanıcının kliniği ÇOKTAN olabilir (yeni cihaz, çerez temizliği,
    // oturum süresi dolması) ve onu kurulum sihirbazına atmak yanlıştı.
    // /panel (app) segmentinde: layout.tsx'teki requireClinic() üç durumu da
    // doğru ele alıyor — tek üyelik varsa otomatik seçip devam ediyor, birden
    // fazlaysa /klinik-sec'e, hiç yoksa /kurulum'a yönlendiriyor. Yeni KAYIT
    // akışı (kayit/page.tsx) /kurulum'a gitmeye devam ediyor; orada kullanıcının
    // gerçekten kliniği yok.
    router.push('/panel')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Giriş yap</CardTitle>
        <CardDescription>Öğün hesabınıza giriş yapın.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Şifre</Label>
              <Link href="/sifremi-unuttum" className="text-sm text-muted-foreground hover:underline">
                Şifremi unuttum
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </Button>
        </form>
        {/* GitHub issue #52 / Prompt 9.2 — bkz. google-sign-in-button.tsx
            dosya başı notu: bu düğme YENİ eklendi, yukarıdaki e-posta+şifre
            formu DEĞİŞMEDİ. */}
        <GoogleSignInButton />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Hesabınız yok mu?{' '}
          <Link href="/kayit" className="text-primary hover:underline">
            Kayıt olun
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
