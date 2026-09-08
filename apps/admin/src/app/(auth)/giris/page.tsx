import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Giriş' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ hata?: string }>
}) {
  const { hata } = await searchParams
  return (
    <section className="auth-card stack">
      <header>
        <div className="brand">Ogun Operasyon</div>
        <h1>Yetkili personel girişi</h1>
        <p className="muted">Yalnızca yetkili Ogun personeli içindir.</p>
      </header>
      {hata === 'erisim' ? (
        <div className="error">Bu hesap Ogun Operasyon sistemine erişim yetkisine sahip değil.</div>
      ) : null}
      <LoginForm />
    </section>
  )
}
