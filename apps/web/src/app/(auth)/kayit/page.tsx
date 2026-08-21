'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { AuthCard, AuthError } from '../_components/auth-card'
import { GoogleSignInButton } from '@/components/google-sign-in-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { registerSchema, type RegisterFormValues } from '@/lib/validation/auth-schemas'

export default function KayitPage() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({ resolver: zodResolver(registerSchema) })

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
    router.push('/kurulum')
    router.refresh()
  }

  return (
    <AuthCard
      eyebrow="Klinik kurulumu"
      title="Klinik yönetici hesabınızı oluşturun."
      description="Bu ilk hesap kurumun yöneticisidir. Kurulumdan sonra diyetisyenlerinizi e-posta ile davet edebilir ve kliniğin çalışma alanını yönetebilirsiniz."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Zaten bir Öğün hesabınız var mı?{' '}
          <Link
            href="/giris"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            Giriş yapın
          </Link>
        </p>
      }
    >
      <form
        className="flex flex-col gap-4"
        method="post"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="name" className="text-sm font-medium">
            Ad soyad
          </Label>
          <div className="relative">
            <UserRound
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Klinik yöneticisinin adı"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'register-name-error' : undefined}
              className="h-11 rounded-xl bg-card pr-3 pl-10"
              {...register('name')}
            />
          </div>
          {errors.name ? (
            <p id="register-name-error" className="text-xs text-destructive">
              {errors.name.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email" className="text-sm font-medium">
            İş e-postası
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
              aria-describedby={errors.email ? 'register-email-error' : undefined}
              className="h-11 rounded-xl bg-card pr-3 pl-10"
              {...register('email')}
            />
          </div>
          {errors.email ? (
            <p id="register-email-error" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Şifre
            </Label>
            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="En az 8 karakter"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'register-password-error' : undefined}
                className="h-11 rounded-xl bg-card pr-3 pl-10"
                {...register('password')}
              />
            </div>
            {errors.password ? (
              <p id="register-password-error" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Şifre tekrar
            </Label>
            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Şifrenizi tekrarlayın"
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={errors.confirmPassword ? 'register-confirm-error' : undefined}
                className="h-11 rounded-xl bg-card pr-3 pl-10"
                {...register('confirmPassword')}
              />
            </div>
            {errors.confirmPassword ? (
              <p id="register-confirm-error" className="text-xs text-destructive">
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2.5 rounded-xl border border-border bg-muted/45 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Diyetisyen hesapları daha sonra yönetici tarafından güvenli davet bağlantısıyla eklenir.
          </span>
        </div>

        {formError ? <AuthError>{formError}</AuthError> : null}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 h-11 w-full rounded-xl shadow-sm shadow-primary/20"
        >
          {isSubmitting ? 'Hesap oluşturuluyor…' : 'Klinik hesabını oluştur'}
          {!isSubmitting ? <ArrowRight aria-hidden="true" /> : null}
        </Button>
      </form>
      <GoogleSignInButton />
    </AuthCard>
  )
}
