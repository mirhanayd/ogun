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
import { authClient } from '@/lib/auth-client'
import { loginSchema, type LoginFormValues } from '@/lib/validation/auth-schemas'

export default function GirisPage() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)

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
    router.push('/kurulum')
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
