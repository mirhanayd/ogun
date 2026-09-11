'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { acceptClinicalReviewerInvitationAction } from './actions'

export function InvitationActivationForm({
  token,
  email,
  name,
  createAccount,
}: {
  token: string
  email: string
  name: string
  createAccount: boolean
}) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function activate(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (createAccount) {
        if (password.length < 8) {
          setError('Şifre en az 8 karakter olmalıdır.')
          return
        }
        if (password !== confirm) {
          setError('Şifreler eşleşmiyor.')
          return
        }
        const result = await authClient.signUp.email({ email, name, password })
        if (result.error) {
          setError(
            result.error.status === 422
              ? 'Bu e-posta için zaten hesap var; giriş yaparak devam edin.'
              : (result.error.message ?? 'Hesap oluşturulamadı.'),
          )
          return
        }
        // Public registration intentionally does not auto-sign-in because its
        // duplicate response must be indistinguishable. This invite is an
        // email-possession proof, so establish the just-created session before
        // the server atomically consumes the invite and verifies the address.
        const signInResult = await authClient.signIn.email({ email, password })
        if (signInResult.error) {
          setError('Hesap oluşturuldu ancak oturum açılamadı. Giriş yaparak devam edin.')
          return
        }
      }
      const accepted = await acceptClinicalReviewerInvitationAction(token)
      if (!accepted.success) {
        setError(accepted.error ?? 'Davet kabul edilemedi.')
        return
      }
      router.push('/clinical-review')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="space-y-4" onSubmit={activate}>
      {createAccount ? (
        <>
          <div className="space-y-2">
            <Label>E-posta</Label>
            <Input value={email} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reviewer-password">Şifre</Label>
            <Input
              id="reviewer-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reviewer-confirm">Şifre tekrar</Label>
            <Input
              id="reviewer-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
        </>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button className="w-full" disabled={busy}>
        {busy
          ? 'Etkinleştiriliyor…'
          : createAccount
            ? 'Hesabı oluştur ve daveti kabul et'
            : 'Daveti kabul et'}
      </Button>
    </form>
  )
}
