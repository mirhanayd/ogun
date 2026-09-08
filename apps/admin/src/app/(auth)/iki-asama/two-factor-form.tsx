'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function TwoFactorForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false })
    setPending(false)
    if (result.error) {
      setError('Kod doğrulanamadı. Yeni bir kodla tekrar deneyin.')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="code">Doğrulama kodu</label>
        <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
      <button className="button" type="submit" disabled={pending}>{pending ? 'Doğrulanıyor…' : 'Doğrula'}</button>
    </form>
  )
}
