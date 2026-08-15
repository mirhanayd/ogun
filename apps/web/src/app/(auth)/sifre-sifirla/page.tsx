'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  })

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) {
      setFormError('Sıfırlama bağlantısı geçersiz veya süresi dolmuş.')
      return
    }
    setFormError(null)
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    })
    if (error) {
      setFormError(error.message ?? 'Şifre sıfırlanamadı, bağlantının süresi dolmuş olabilir.')
      return
    }
    router.push('/giris')
  }

  if (!token) {
    return (
      <p className="text-sm text-destructive">
        Sıfırlama bağlantısı geçersiz veya süresi dolmuş. Lütfen{' '}
        <Link href="/sifremi-unuttum" className="text-primary hover:underline">
          yeniden isteyin
        </Link>
        .
      </p>
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Yeni şifre</Label>
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
        <Label htmlFor="confirmPassword">Yeni şifre tekrar</Label>
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
        {isSubmitting ? 'Kaydediliyor…' : 'Şifreyi sıfırla'}
      </Button>
    </form>
  )
}

export default function SifreSifirlaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Şifreyi sıfırla</CardTitle>
        <CardDescription>Hesabınız için yeni bir şifre belirleyin.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={null}>
          <SifreSifirlaForm />
        </Suspense>
      </CardContent>
    </Card>
  )
}
