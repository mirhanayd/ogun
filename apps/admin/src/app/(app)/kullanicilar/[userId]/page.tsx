import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getUserForPlatform, listUserDevicesForPlatform, listUserSessionsForPlatform } from '@ogun/db/queries'
import { ConfirmSubmitButton } from '@/components/confirm-submit-button'
import { DeviceTable } from '@/components/device-table'
import { OperationFeedback } from '@/components/operation-feedback'
import { SessionTable } from '@/components/session-table'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { roleHasPermission } from '@/lib/platform-permissions'
import { revokeAllSessionsAction, sendPasswordResetAction } from '../../operations-actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function UserDetailPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: Promise<{ clinicId?: string; mesaj?: string; hata?: string }> }) {
  const ctx = await requirePlatformPermission('users.read')
  const { userId } = await params
  const query = await searchParams
  const [user, sessions, devices] = await Promise.all([getUserForPlatform(db, userId), listUserSessionsForPlatform(db, userId), listUserDevicesForPlatform(db, userId)])
  if (!user) notFound()
  const clinicId = query.clinicId && user.memberships.some((membership) => membership.clinicId === query.clinicId) ? query.clinicId : undefined
  const returnTo = `/kullanicilar/${userId}${clinicId ? `?clinicId=${encodeURIComponent(clinicId)}` : ''}`
  const canRevoke = roleHasPermission(ctx.staff.role, 'users.revoke_session')
  const canReset = roleHasPermission(ctx.staff.role, 'users.send_password_reset')
  return <><div className="breadcrumbs">{clinicId ? <><Link href={`/klinikler/${clinicId}?tab=kullanicilar`}>Klinik kullanıcıları</Link> / </> : null}Kullanıcı</div><div className="page-head"><div><h1>{user.name}</h1><p className="muted">{user.email}</p></div><div className="actions">{canReset ? <form action={sendPasswordResetAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button" type="submit">Şifre sıfırlama e-postası gönder</button></form> : null}{canRevoke ? <form action={revokeAllSessionsAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="clinicId" value={clinicId ?? ''} /><input type="hidden" name="returnTo" value={returnTo} /><ConfirmSubmitButton message={'Bu kullanıcının web ve masaüstü oturumları kapatılacak.\nKullanıcının yeniden giriş yapması gerekecek.'}>Tüm normal oturumları sonlandır</ConfirmSubmitButton></form> : null}</div></div>
    <OperationFeedback message={query.mesaj} error={query.hata} />
    <section className="card"><dl className="detail-grid"><div><dt>Ad</dt><dd>{user.name}</dd></div><div><dt>E-posta</dt><dd>{user.email}</dd></div><div><dt>E-posta doğrulandı</dt><dd>{user.emailVerified ? 'Evet' : 'Hayır'}</dd></div><div><dt>Oluşturulma</dt><dd>{user.createdAt.toLocaleString('tr-TR')}</dd></div></dl></section>
    <section className="section"><h2>Klinik üyelikleri</h2><div className="table-wrap"><table><thead><tr><th>Klinik</th><th>Rol</th><th>Katılım</th></tr></thead><tbody>{user.memberships.map((membership) => <tr key={membership.clinicId}><td><Link className="table-link" href={`/klinikler/${membership.clinicId}?tab=kullanicilar`}>{membership.clinicName}</Link><br /><small>{membership.clinicSlug}</small></td><td>{membership.role}</td><td>{membership.joinedAt.toLocaleString('tr-TR')}</td></tr>)}</tbody></table></div></section>
    <section className="section"><h2>Normal web / masaüstü oturumları</h2><p className="muted">Session tokenları ve admin oturumları bu ekrana dönmez.</p><SessionTable sessions={sessions} userId={user.id} clinicId={clinicId} returnTo={returnTo} canRevoke={canRevoke} /></section>
    <section className="section"><h2>Ogun Desktop cihazları</h2><p className="muted">Tarayıcı oturumları için cihaz fingerprint değeri üretilmez.</p><DeviceTable devices={devices} clinicId={clinicId} returnTo={returnTo} canManage={roleHasPermission(ctx.staff.role, 'devices.manage')} /></section>
  </>
}
