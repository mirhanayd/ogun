'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { authClient } from '@/lib/auth-client'
import { registerSchema, type RegisterFormValues } from '@/lib/validation/auth-schemas'

export default function KayitPage() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  })

  async function onSubmit(values: RegisterFormValues) {
    setFormError(null)
    const { error } = await authClient.signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    })
    if (error) {
      setFormError(
        error.status === 422
          ? 'Bu e-posta adresi zaten kayıtlı.'
          : (error.message ?? 'Kayıt oluşturulamadı, lütfen tekrar deneyin.'),
      )
      return
    }
    // Kayıt sonrası klinik oluşturma akışına yönlendir (bkz. Prompt 3.2 — /kurulum).
    router.push('/kurulum')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hesap oluştur</CardTitle>
        <CardDescription>Kliniğinizi Öğün&apos;e taşımaya başlayın.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Ad soyad</Label>
            <Input id="name" type="text" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Şifre</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Şifre tekrar</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Hesap oluşturuluyor…' : 'Kayıt ol'}
          </Button>
        </form>
        {/* GitHub issue #52 / Prompt 9.2 — bkz. google-sign-in-button.tsx
            dosya başı notu: bu düğme YENİ eklendi, yukarıdaki form DEĞİŞMEDİ. */}
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          veya
          <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleSignInButton />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Zaten hesabınız var mı?{' '}
          <Link href="/giris" className="text-primary hover:underline">
            Giriş yapın
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
