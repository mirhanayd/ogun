import { db } from '@ogun/db'
import { listPlatformStaff } from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PlatformStaffPage() {
  await requirePlatformPermission('platform_staff.read')
  const staff = await listPlatformStaff(db)
  return (
    <>
      <div className="page-head"><div><h1>Platform personeli</h1><p className="muted">Yetkiler bootstrap CLI üzerinden yönetilir.</p></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Ad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>Oluşturulma</th></tr></thead>
        <tbody>{staff.map((row) => <tr key={row.id}><td>{row.name}</td><td>{row.email}</td><td><code>{row.role}</code></td><td><span className={`badge ${row.isActive ? 'success' : 'failure'}`}>{row.isActive ? 'Aktif' : 'Devre dışı'}</span></td><td>{row.createdAt.toLocaleString('tr-TR')}</td></tr>)}</tbody>
      </table></div>
    </>
  )
}
