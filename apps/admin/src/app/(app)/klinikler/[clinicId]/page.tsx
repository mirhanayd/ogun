import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getClinicForPlatform, listClinicDevicesForPlatform, listClinicMembersForPlatform, listClinicSessionsForPlatform } from '@ogun/db/queries'
import { DeviceTable } from '@/components/device-table'
import { OperationFeedback } from '@/components/operation-feedback'
import { SessionTable } from '@/components/session-table'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { roleHasPermission } from '@/lib/platform-permissions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const tabs = { genel: 'Genel', kullanicilar: 'Kullanıcılar', oturumlar: 'Oturumlar', cihazlar: 'Cihazlar', abonelik: 'Abonelik' } as const
type Tab = keyof typeof tabs

function DetailList({ values }: { values: Array<[string, React.ReactNode]> }) {
  return <dl className="detail-grid">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
}

export default async function ClinicDetailPage({ params, searchParams }: { params: Promise<{ clinicId: string }>; searchParams: Promise<{ tab?: string; mesaj?: string; hata?: string }> }) {
  const ctx = await requirePlatformPermission('clinics.read')
  const { clinicId } = await params
  const query = await searchParams
  const tab: Tab = query.tab && query.tab in tabs ? query.tab as Tab : 'genel'
  const clinic = await getClinicForPlatform(db, clinicId)
  if (!clinic) notFound()
  const returnTo = `/klinikler/${clinicId}?tab=${tab}`
  const [members, sessions, devices] = await Promise.all([
    tab === 'kullanicilar' ? listClinicMembersForPlatform(db, clinicId) : Promise.resolve([]),
    tab === 'oturumlar' ? listClinicSessionsForPlatform(db, clinicId) : Promise.resolve([]),
    tab === 'cihazlar' ? listClinicDevicesForPlatform(db, clinicId) : Promise.resolve([]),
  ])
  return <><div className="breadcrumbs"><Link href="/klinikler">Klinikler</Link> / {clinic.name}</div><div className="page-head"><div><h1>{clinic.name}</h1><p className="muted">{clinic.slug}</p></div><div className="header-badges"><span className="badge">{clinic.planCode ?? 'Plansız'}</span><span className="badge">{clinic.subscriptionStatus}</span></div></div>
    <OperationFeedback message={query.mesaj} error={query.hata} />
    <nav className="tabs">{Object.entries(tabs).map(([key, label]) => <Link className={tab === key ? 'active' : ''} key={key} href={`/klinikler/${clinicId}?tab=${key}`}>{label}</Link>)}</nav>
    {tab === 'genel' ? <section className="card"><DetailList values={[["Klinik adı", clinic.name], ["Slug", clinic.slug], ["Telefon", clinic.phone], ["Adres", clinic.address], ["Tax ID", clinic.taxId], ["Abonelik durumu", clinic.subscriptionStatus], ["Trial end", clinic.trialEndsAt?.toLocaleString('tr-TR')], ["Onboarding", clinic.onboardingCompletedAt ? `Tamamlandı · adım ${clinic.onboardingStep}` : `Eksik · adım ${clinic.onboardingStep}`], ["Oluşturulma", clinic.createdAt.toLocaleString('tr-TR')], ["Üye sayısı", clinic.memberCount]]} /></section> : null}
    {tab === 'kullanicilar' ? <div className="table-wrap"><table><thead><tr><th>Ad</th><th>E-posta</th><th>Klinik rolü</th><th>Doğrulandı</th><th>Katılım</th><th>Aktif oturum</th><th>Son oturum</th><th>Cihaz</th></tr></thead><tbody>{members.map((member) => <tr key={member.userId}><td><Link className="table-link" href={`/kullanicilar/${member.userId}?clinicId=${clinicId}`}>{member.name}</Link></td><td>{member.email}</td><td>{member.role}</td><td>{member.emailVerified ? 'Evet' : 'Hayır'}</td><td>{member.joinedAt.toLocaleDateString('tr-TR')}</td><td>{member.activeSessionCount}</td><td>{member.lastSessionAt?.toLocaleString('tr-TR') ?? '—'}</td><td>{member.deviceCount}</td></tr>)}</tbody></table></div> : null}
    {tab === 'oturumlar' ? <><p className="muted">Yalnız canonical normal web/masaüstü oturumları gösterilir; admin oturumları ayrı tutulur.</p><SessionTable sessions={sessions} clinicId={clinicId} returnTo={returnTo} canRevoke={roleHasPermission(ctx.staff.role, 'users.revoke_session')} showUser /></> : null}
    {tab === 'cihazlar' ? <><p className="muted">Yalnız bu kliniğin üyeleriyle ilişkilendirilmiş Ogun Desktop kurulumları. Fingerprint, random installation ID hash değerinin kısa görünümüdür.</p><DeviceTable devices={devices} clinicId={clinicId} returnTo={returnTo} canManage={roleHasPermission(ctx.staff.role, 'devices.manage')} showUsers /></> : null}
    {tab === 'abonelik' ? <section className="card"><DetailList values={[["Plan", clinic.planCode], ["Faturalama", clinic.billingCycle], ["Provider", clinic.provider], ["Dönem başlangıcı", clinic.currentPeriodStart?.toLocaleString('tr-TR')], ["Dönem sonu", clinic.currentPeriodEnd?.toLocaleString('tr-TR')], ["Dönem sonunda iptal", clinic.cancelAtPeriodEnd == null ? null : clinic.cancelAtPeriodEnd ? 'Evet' : 'Hayır'], ["Abonelik durumu", clinic.subscriptionStatus], ["Trial end", clinic.trialEndsAt?.toLocaleString('tr-TR')]]} /><details className="technical"><summary>Teknik provider detayları</summary><DetailList values={[["Customer ID", clinic.providerCustomerId], ["Subscription ID", clinic.providerSubscriptionId]]} /></details></section> : null}
  </>
}
