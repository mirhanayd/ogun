import { ConfirmSubmitButton } from './confirm-submit-button'
import { reactivateDeviceAction, revokeDeviceAction } from '@/app/(app)/operations-actions'

interface DeviceRow {
  id: string
  fingerprint: string
  platform: string
  displayName: string
  appVersion: string
  status: 'active' | 'revoked'
  firstSeenAt: Date
  lastSeenAt: Date
  lastIpAddress: string | null
  revokedAt: Date | null
  revokedReason: string | null
  users?: string
  activeSessionCount?: number
}

export function DeviceTable({ devices, clinicId, returnTo, canManage, showUsers = false }: {
  devices: DeviceRow[]
  clinicId?: string
  returnTo: string
  canManage: boolean
  showUsers?: boolean
}) {
  return <div className="table-wrap"><table><thead><tr><th>Cihaz</th>{showUsers ? <th>Kullanıcılar</th> : null}<th>Platform / sürüm</th><th>Durum</th><th>İlk / son görülme</th><th>Son IP</th>{canManage ? <th>İşlem</th> : null}</tr></thead><tbody>
    {devices.length === 0 ? <tr><td colSpan={showUsers ? 7 : 6} className="muted">Kayıtlı Ogun Desktop cihazı yok.</td></tr> : devices.map((device) => <tr key={device.id}>
      <td><strong>{device.displayName}</strong><br /><code>OGUN-{device.fingerprint}</code>{device.activeSessionCount === undefined ? null : <><br /><small>{device.activeSessionCount} bağlı aktif oturum</small></>}</td>
      {showUsers ? <td className="wrap-cell">{device.users}</td> : null}<td>{device.platform}<br /><small>{device.appVersion}</small></td>
      <td><span className={`badge ${device.status === 'active' ? 'success' : 'failure'}`}>{device.status === 'active' ? 'Aktif' : 'İptal'}</span>{device.revokedReason ? <><br /><small>{device.revokedReason}</small></> : null}</td>
      <td>{device.firstSeenAt.toLocaleString('tr-TR')}<br /><small>{device.lastSeenAt.toLocaleString('tr-TR')}</small></td><td>{device.lastIpAddress ?? '—'}</td>
      {canManage ? <td>{device.status === 'active' ? <form action={revokeDeviceAction} className="compact-form"><input type="hidden" name="deviceId" value={device.id} /><input type="hidden" name="clinicId" value={clinicId ?? ''} /><input type="hidden" name="returnTo" value={returnTo} /><input className="input compact-input" name="reason" minLength={3} maxLength={500} placeholder="İptal nedeni" required /><ConfirmSubmitButton message="Bu cihazın erişimi kaldırılacak ve yalnız bu cihaza bağlı normal oturumlar kapatılacak. Devam edilsin mi?">Cihazı iptal et</ConfirmSubmitButton></form> : <form action={reactivateDeviceAction}><input type="hidden" name="deviceId" value={device.id} /><input type="hidden" name="clinicId" value={clinicId ?? ''} /><input type="hidden" name="returnTo" value={returnTo} /><button className="button" type="submit">Yeniden etkinleştir</button></form>}</td> : null}
    </tr>)}
  </tbody></table></div>
}
