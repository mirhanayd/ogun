'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { AuthCard, AuthError } from '../_components/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/validation/auth-schemas'

function SifreSifirlaForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) })

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) {
      setFormError('Sıfırlama bağlantısı geçersiz veya süresi dolmuş.')
      return
    }
    setFormError(null)
    const { error } = await authClient.resetPassword({ newPassword: values.password, token })
    if (error) {
      setFormError(error.message ?? 'Şifre sıfırlanamadı, bağlantının süresi dolmuş olabilir.')
      return
    }
    router.push('/giris')
  }

  if (!token) {
    return (
      <div className="space-y-5">
        <AuthError>Sıfırlama bağlantısı geçersiz veya süresi dolmuş.</AuthError>
        <Button asChild variant="outline" className="h-11 w-full rounded-xl">
          <Link href="/sifremi-unuttum">
            Yeni bağlantı isteyin <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-5"
      method="post"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-sm font-medium">
          Yeni şifre
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
            aria-describedby={errors.password ? 'reset-password-error' : undefined}
            className="h-11 rounded-xl bg-card pr-3 pl-10"
            {...register('password')}
          />
        </div>
        {errors.password ? (
          <p id="reset-password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword" className="text-sm font-medium">
          Yeni şifre tekrar
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
            aria-describedby={errors.confirmPassword ? 'reset-confirm-error' : undefined}
            className="h-11 rounded-xl bg-card pr-3 pl-10"
            {...register('confirmPassword')}
          />
        </div>
        {errors.confirmPassword ? (
          <p id="reset-confirm-error" className="text-xs text-destructive">
            {errors.confirmPassword.message}
          </p>
        ) : null}
      </div>
      {formError ? <AuthError>{formError}</AuthError> : null}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-xl shadow-sm shadow-primary/20"
      >
        {isSubmitting ? 'Kaydediliyor…' : 'Yeni şifreyi kaydet'}
        {!isSubmitting ? <ArrowRight aria-hidden="true" /> : null}
      </Button>
    </form>
  )
}

export default function SifreSifirlaPage() {
  return (
    <AuthCard
      eyebrow="Hesap güvenliği"
      title="Yeni şifrenizi belirleyin."
      description="Önceki şifrenizden farklı, yalnızca Öğün hesabınız için kullandığınız güçlü bir şifre seçin."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/giris"
            className="inline-flex items-center gap-2 rounded font-semibold text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" /> Girişe geri dön
          </Link>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="h-44 animate-pulse rounded-2xl bg-muted" aria-label="Form yükleniyor" />
        }
      >
        <SifreSifirlaForm />
      </Suspense>
    </AuthCard>
  )
}
