'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { AuthCard, AuthError } from '../_components/auth-card'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { loginSchema, type LoginFormValues } from '@/lib/validation/auth-schemas'

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
    toast.error(
      GOOGLE_ERROR_MESSAGES[hata] ?? 'Google ile giriş tamamlanamadı, lütfen tekrar deneyin.',
    )
    router.replace('/giris')
  }, [router])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

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
    router.push('/panel')
    router.refresh()
  }

  return (
    <AuthCard
      eyebrow="Tekrar hoş geldiniz"
      title="Kliniğinize kaldığınız yerden devam edin."
      description="Öğün hesabınıza giriş yapın. Danışanlarınız, planlarınız ve ekip çalışma alanınız sizi bekliyor."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Kliniğiniz için ilk hesabı mı açıyorsunuz?{' '}
          <Link
            href="/kayit"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Yönetici hesabı oluşturun
          </Link>
        </p>
      }
    >
      <form
        className="auth-login-form flex flex-col gap-5"
        method="post"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-sm font-medium">
            E-posta
          </Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="ad@klinik.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className="h-11 rounded-xl bg-card pr-3 pl-10"
              {...register('email')}
            />
          </div>
          {errors.email ? (
            <p id="login-email-error" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="password" className="text-sm font-medium">
              Şifre
            </Label>
            <Link
              href="/sifremi-unuttum"
              className="rounded text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Şifremi unuttum
            </Link>
          </div>
          <div className="relative">
            <LockKeyhole
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Şifreniz"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              className="h-11 rounded-xl bg-card pr-3 pl-10"
              {...register('password')}
            />
          </div>
          {errors.password ? (
            <p id="login-password-error" className="text-xs text-destructive">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        {formError ? <AuthError>{formError}</AuthError> : null}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 h-11 w-full rounded-xl shadow-sm shadow-primary/20"
        >
          {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
          {!isSubmitting ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </form>
      <GoogleSignInButton />
    </AuthCard>
  )
}
