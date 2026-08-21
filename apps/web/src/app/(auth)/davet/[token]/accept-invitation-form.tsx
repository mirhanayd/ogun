'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  acceptClinicInvitationSchema,
  type AcceptClinicInvitationValues,
} from '@/lib/validation/clinic-invitation-schemas'
import { acceptClinicInvitationAction } from './actions'

export function AcceptInvitationForm({
  token,
  accountExists,
  requiresPassword,
}: {
  token: string
  accountExists: boolean
  requiresPassword: boolean
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [isAcceptingExisting, setIsAcceptingExisting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptClinicInvitationValues>({ resolver: zodResolver(acceptClinicInvitationSchema) })

  async function accept(input?: AcceptClinicInvitationValues) {
    setFormError(null)
    const result = await acceptClinicInvitationAction(token, input)
    if (!result.success) {
      setFormError(result.error ?? 'Davet kabul edilemedi.')
      return
    }
    setAccepted(true)
  }

  if (accepted) {
    return (
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <CheckCircle2 className="size-10 text-primary" />
        <div>
          <p className="font-semibold">Kliniğe katıldınız</p>
          <p className="mt-1 text-sm text-muted-foreground">Hesabınızla giriş yaparak size atanan danışanları görebilirsiniz.</p>
        </div>
        <Button asChild className="mt-2 w-full">
          <Link href="/giris">Giriş yap</Link>
        </Button>
      </div>
    )
  }

  if (!requiresPassword) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Bu e-posta adresiyle bir Öğün hesabınız zaten var. Mevcut şifreniz değişmeyecek; daveti kabul ettikten sonra hesabınızla giriş yapabilirsiniz.
        </p>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
        <Button
          type="button"
          disabled={isAcceptingExisting}
          onClick={async () => {
            setIsAcceptingExisting(true)
            await accept()
            setIsAcceptingExisting(false)
          }}
        >
          {isAcceptingExisting ? 'Katılım tamamlanıyor…' : 'Daveti kabul et'}
        </Button>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-4" method="post" onSubmit={handleSubmit((values) => accept(values))} noValidate>
      {accountExists && (
        <p className="text-sm text-muted-foreground">
          Bu e-posta adresiyle sosyal giriş kullanan bir Öğün hesabınız var. Mevcut hesabınıza şifreli giriş ekleyerek
          daveti tamamlayabilirsiniz.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invitation-password">Şifre</Label>
        <Input
          id="invitation-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...register('password')}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invitation-confirm-password">Şifre tekrar</Label>
        <Input
          id="invitation-confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirmPassword)}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
      </div>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Hesap oluşturuluyor…' : 'Şifremi oluştur ve katıl'}
      </Button>
    </form>
  )
}
