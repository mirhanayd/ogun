'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { requestPasswordReset } from '@/lib/auth-client'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth-schemas'
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

export default function SifremiUnuttumPage() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  async function onSubmit(values: ForgotPasswordInput) {
    setServerError(null)

    const { error } = await requestPasswordReset({
      email: values.email,
      redirectTo: '/sifre-sifirla',
    })

    if (error) {
      setServerError(error.message ?? 'Şifre sıfırlama isteği gönderilemedi. Lütfen tekrar deneyin.')
      return
    }

    // Kullanıcı numaralandırmasını önlemek için hesap var/yok bilgisini sızdırmayız,
    // her durumda aynı mesajı gösteririz.
    setSent(true)
  }

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>E-posta gönderildi</CardTitle>
          <CardDescription>
            Bu e-posta adresine kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi. Gelen
            kutunuzu (ve spam klasörünü) kontrol edin.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/giris" className="text-sm text-foreground hover:underline">
            Girişe dön
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Şifremi unuttum</CardTitle>
        <CardDescription>
          Hesabınıza kayıtlı e-posta adresini girin, şifre sıfırlama bağlantısı gönderelim.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Gönderiliyor…' : 'Sıfırlama bağlantısı gönder'}
          </Button>
          <Link href="/giris" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            Girişe dön
          </Link>
        </CardFooter>
      </form>
    </Card>
  )
}
