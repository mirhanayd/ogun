'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { authClient } from '@/lib/auth-client'
import { isNativeShell } from '@/lib/native-shell'
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/lib/validation/auth-schemas'

export default function SifremiUnuttumPage() {
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(values: ForgotPasswordFormValues) {
    setFormError(null)
    // GitHub issue #52 / Prompt 9.2, GÖREV 2 — native kabukta çalışırken
    // e-postadaki bağlantı ogun://auth/reset-password deep link şemasını
    // kullanmalı ki tıklanınca DOĞRUDAN masaüstü uygulaması açılsın (bkz.
    // apps/desktop/src-tauri/src/deep_link.rs — token'ı YAKALAYIP pencereyi
    // doğrudan bu web sayfasının (sifre-sifirla) KENDİSİNE, aynı token'la
    // yönlendirir; bu sayfada BAŞKA hiçbir değişiklik YOK). Web tarayıcısında
    // davranış TAMAMEN aynı kalır (auth.ts'teki trustedOrigins notuna bkz.).
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: isNativeShell() ? 'ogun://auth/reset-password' : '/sifre-sifirla',
    })
    if (error) {
      setFormError(error.message ?? 'İstek gönderilemedi, lütfen tekrar deneyin.')
      return
    }
    setSent(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Şifremi unuttum</CardTitle>
        <CardDescription>E-posta adresinize bir sıfırlama bağlantısı gönderelim.</CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            Bu e-posta sistemde kayıtlıysa, şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link href="/giris" className="text-primary hover:underline">
            Girişe geri dön
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
