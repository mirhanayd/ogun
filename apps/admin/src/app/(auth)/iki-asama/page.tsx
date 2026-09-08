import type { Metadata } from 'next'
import { TwoFactorForm } from './two-factor-form'

export const metadata: Metadata = { title: 'İki aşamalı doğrulama' }

export default function TwoFactorPage() {
  return (
    <section className="auth-card stack">
      <header>
        <div className="brand">Ogun Operasyon</div>
        <h1>İki aşamalı doğrulama</h1>
        <p className="muted">Authenticator uygulamanızdaki 6 haneli kodu girin.</p>
      </header>
      <TwoFactorForm />
    </section>
  )
}
