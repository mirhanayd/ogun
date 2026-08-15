'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { resetPassword } from '@/lib/auth-client'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/auth-schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

function SifreSifirlaForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  async function onSubmit(values: ResetPasswordInput) {
    setServerError(null)

    if (!token) {
      setServerError('Sıfırlama bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.')
      return
    }

    const { error } = await resetPassword({ newPassword: values.password, token })

    if (error) {
      setServerError(error.message ?? 'Şifre sıfırlanamadı. Bağlantının süresi dolmuş olabilir.')
      return
    }

    setDone(true)
    setTimeout(() => router.push('/giris'), 1500)
  }

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bağlantı geçersiz</CardTitle>
          <CardDescription>
            Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/sifremi-unuttum" className="text-sm text-foreground hover:underline">
            Yeni bağlantı iste
          </Link>
        </CardFooter>
      </Card>
    )
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Şifreniz güncellendi</CardTitle>
          <CardDescription>Giriş sayfasına yönlendiriliyorsunuz…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yeni şifre belirle</CardTitle>
        <CardDescription>Hesabınız için yeni bir şifre girin.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Yeni şifre</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passwordConfirm">Yeni şifre (tekrar)</Label>
            <Input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              {...register('passwordConfirm')}
            />
            {errors.passwordConfirm && (
              <p className="text-sm text-destructive">{errors.passwordConfirm.message}</p>
            )}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        </CardContent>
        <CardFooter className="pt-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default function SifreSifirlaPage() {
  return (
    <Suspense fallback={null}>
      <SifreSifirlaForm />
    </Suspense>
  )
}
