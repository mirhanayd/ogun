'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signUp } from '@/lib/auth-client'
import { registerSchema, type RegisterInput } from '@/lib/auth-schemas'
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

export default function KayitPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) })

  async function onSubmit(values: RegisterInput) {
    setServerError(null)

    const { error } = await signUp.email({
      name: values.name,
      email: values.email,
      password: values.password,
    })

    if (error) {
      setServerError(
        error.status === 422
          ? 'Bu e-posta adresi zaten kayıtlı.'
          : (error.message ?? 'Kayıt oluşturulamadı. Lütfen tekrar deneyin.'),
      )
      return
    }

    // Kayıt sonrası klinik oluşturma akışına yönlendir (bkz. issue #11).
    router.push('/kurulum')
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hesap oluştur</CardTitle>
        <CardDescription>Kliniğinizi Öğün&apos;e taşımak için birkaç saniyenizi ayırın.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Ad soyad</Label>
            <Input id="name" type="text" autoComplete="name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Şifre</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="passwordConfirm">Şifre (tekrar)</Label>
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
        <CardFooter className="flex flex-col gap-3 pt-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Hesap oluşturuluyor…' : 'Hesap oluştur'}
          </Button>
          <div className="text-sm text-muted-foreground">
            Zaten hesabınız var mı?{' '}
            <Link href="/giris" className="text-foreground hover:underline">
              Giriş yapın
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
