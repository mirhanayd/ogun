import Link from 'next/link'

export default function ForbiddenPage() {
  return <main className="auth-shell"><section className="auth-card"><div className="brand">Ogun Operasyon</div><h1>Erişim reddedildi</h1><p className="muted">Bu operasyon için platform yetkiniz bulunmuyor.</p><Link className="button action-link" href="/">Genel bakışa dön</Link></section></main>
}
