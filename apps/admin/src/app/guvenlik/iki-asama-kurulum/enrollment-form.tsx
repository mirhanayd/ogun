'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import QRCode from 'qrcode'
import { authClient } from '@/lib/auth-client'

export function EnrollmentForm() {
  const router = useRouter()
  const [setup, setSetup] = useState<{ uri: string; qr: string; backupCodes: string[] } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    const result = await authClient.twoFactor.enable({ password, issuer: 'Ogun Operasyon' })
    if (result.error || !result.data) {
      setPending(false)
      setError('Kurulum başlatılamadı. Şifrenizi kontrol edin.')
      return
    }
    const qr = await QRCode.toDataURL(result.data.totpURI, { width: 440, margin: 1 })
    setSetup({ uri: result.data.totpURI, qr, backupCodes: result.data.backupCodes })
    setPending(false)
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false })
    setPending(false)
    if (result.error) {
      setError('Kod doğrulanamadı. Authenticator uygulamanızdaki güncel kodu deneyin.')
      return
    }
    router.push('/')
    router.refresh()
  }

  if (!setup) {
    return (
      <form className="stack" onSubmit={begin}>
        <div className="field">
          <label htmlFor="password">Mevcut şifreniz</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        <button className="button" type="submit" disabled={pending}>{pending ? 'Hazırlanıyor…' : 'Kurulumu başlat'}</button>
      </form>
    )
  }

  return (
    <div className="stack">
      <Image className="qr" src={setup.qr} alt="Authenticator uygulaması için TOTP QR kodu" width={220} height={220} unoptimized />
      <div>
        <strong>Kurulum kodu</strong>
        <div className="secret">{setup.uri}</div>
      </div>
      <div className="notice">
        <strong>Yedek kodları şimdi güvenli bir yere kaydedin.</strong>
        <ul className="backup">{setup.backupCodes.map((code) => <li key={code}>{code}</li>)}</ul>
      </div>
      <form className="stack" onSubmit={verify}>
        <div className="field">
          <label htmlFor="code">6 haneli doğrulama kodu</label>
          <input className="input" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
        </div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        <button className="button" type="submit" disabled={pending}>{pending ? 'Doğrulanıyor…' : 'Doğrula ve etkinleştir'}</button>
      </form>
    </div>
  )
}
