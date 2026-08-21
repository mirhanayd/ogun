'use client'

import { useState } from 'react'
import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, ArrowRight, Mail, MailCheck } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { AuthCard, AuthError } from '../_components/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) })

  async function onSubmit(values: ForgotPasswordFormValues) {
    setFormError(null)
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
    <AuthCard
      eyebrow="Hesap erişimi"
      title={sent ? 'Bağlantı yola çıktı.' : 'Şifrenizi güvenle yenileyin.'}
      description={
        sent
          ? 'E-posta adresi sistemde kayıtlıysa sıfırlama bağlantısını birkaç dakika içinde alacaksınız.'
          : 'Öğün hesabınızda kullandığınız e-posta adresini girin. Size tek kullanımlık bir şifre yenileme bağlantısı gönderelim.'
      }
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
      {sent ? (
        <div role="status" className="rounded-2xl border border-primary/15 bg-primary/[0.065] p-6">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary">
            <MailCheck aria-hidden="true" className="size-5" />
          </span>
          <h2 className="mt-5 font-semibold">Gelen kutunuzu kontrol edin</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Bağlantıyı göremiyorsanız spam klasörüne bakın veya birkaç dakika sonra yeniden deneyin.
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-5"
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
                aria-describedby={errors.email ? 'forgot-email-error' : undefined}
                className="h-11 rounded-xl bg-card pr-3 pl-10"
                {...register('email')}
              />
            </div>
            {errors.email ? (
              <p id="forgot-email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>
          {formError ? <AuthError>{formError}</AuthError> : null}
          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full rounded-xl shadow-sm shadow-primary/20"
          >
            {isSubmitting ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
            {!isSubmitting ? <ArrowRight aria-hidden="true" /> : null}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
