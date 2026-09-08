'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    const data = new FormData(event.currentTarget)
    const result = await authClient.signIn.email({
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
      rememberMe: false,
    })
    setPending(false)
    if (result.error) {
      setError('Giriş bilgileri doğrulanamadı veya bu hesabın erişim yetkisi yok.')
      return
    }
    if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      router.push('/iki-asama')
      return
    }
    router.push('/')
    router.refresh()
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">E-posta</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Şifre</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? 'Giriş yapılıyor…' : 'Giriş yap'}
      </button>
    </form>
  )
}
