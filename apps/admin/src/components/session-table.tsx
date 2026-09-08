import { ConfirmSubmitButton } from './confirm-submit-button'
import { revokeSessionAction } from '@/app/(app)/operations-actions'
import { describeUserAgent } from '@/lib/user-agent'

interface SessionRow {
  id: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
  activeClinicId: string | null
  role: string | null
  ipAddress: string | null
  userAgent: string | null
  deviceId: string | null
  userId?: string
  userName?: string
  userEmail?: string
}

export function SessionTable({ sessions, userId, clinicId, returnTo, canRevoke, showUser = false }: {
  sessions: SessionRow[]
  userId?: string
  clinicId?: string
  returnTo: string
  canRevoke: boolean
  showUser?: boolean
}) {
  return <div className="table-wrap"><table><thead><tr>{showUser ? <th>Kullanıcı</th> : null}<th>İstemci</th><th>IP</th><th>Aktif klinik / rol</th><th>Son görülme</th><th>Bitiş</th>{canRevoke ? <th>İşlem</th> : null}</tr></thead><tbody>
    {sessions.length === 0 ? <tr><td colSpan={showUser ? 7 : 6} className="muted">Normal kullanıcı oturumu yok.</td></tr> : sessions.map((session) => <tr key={session.id}>
      {showUser ? <td>{session.userName}<br /><small className="muted">{session.userEmail}</small></td> : null}
      <td>{describeUserAgent(session.userAgent, Boolean(session.deviceId))}<details><summary>Raw UA</summary><code className="wrap-code">{session.userAgent ?? '—'}</code></details></td>
      <td>{session.ipAddress ?? '—'}</td><td>{session.activeClinicId ?? '—'}<br /><small>{session.role ?? '—'}</small></td>
      <td>{session.updatedAt.toLocaleString('tr-TR')}</td><td>{session.expiresAt.toLocaleString('tr-TR')}</td>
      {canRevoke ? <td><form action={revokeSessionAction}><input type="hidden" name="sessionId" value={session.id} /><input type="hidden" name="userId" value={userId ?? session.userId} /><input type="hidden" name="clinicId" value={clinicId ?? ''} /><input type="hidden" name="returnTo" value={returnTo} /><ConfirmSubmitButton message="Bu normal web/masaüstü oturumu sonlandırılacak. Devam edilsin mi?">Oturumu sonlandır</ConfirmSubmitButton></form></td> : null}
    </tr>)}
  </tbody></table></div>
}
