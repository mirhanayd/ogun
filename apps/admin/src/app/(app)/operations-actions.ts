'use server'

import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import {
  getUserForPlatform,
  hasRecentPasswordResetRequest,
  insertPlatformAuditLog,
  reactivateDeviceForPlatform,
  revokeAllUserSessionsForPlatform,
  revokeDeviceForPlatform,
  revokeUserSessionForPlatform,
} from '@ogun/db/queries'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { getPlatformRequestMetadata } from '@/lib/platform-audit'
import { PASSWORD_RESET_COOLDOWN_MS, requestUserPasswordReset } from '@/lib/password-reset'

function field(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function safeReturnTo(formData: FormData, fallback: string) {
  const value = field(formData, 'returnTo')
  return value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

function withMessage(path: string, key: 'mesaj' | 'hata', message: string) {
  const url = new URL(path, 'http://admin.local')
  url.searchParams.set(key, message)
  return `${url.pathname}${url.search}`
}

export async function revokeSessionAction(formData: FormData) {
  const ctx = await requirePlatformPermission('users.revoke_session')
  const userId = field(formData, 'userId')
  const sessionId = field(formData, 'sessionId')
  const clinicId = field(formData, 'clinicId') || null
  const returnTo = safeReturnTo(formData, `/kullanicilar/${encodeURIComponent(userId)}`)
  const request = await getPlatformRequestMetadata()
  try {
    await revokeUserSessionForPlatform(db, { ...request, actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, userId, sessionId, clinicId })
  } catch (error) {
    await insertPlatformAuditLog(db, { actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, action: 'user.session.revoked', entityType: 'session', entityId: sessionId, clinicId, outcome: 'failure', reason: error instanceof Error ? error.message : 'Bilinmeyen hata', ...request, metadata: { targetUserId: userId } })
    redirect(withMessage(returnTo, 'hata', 'Oturum sonlandırılamadı.'))
  }
  redirect(withMessage(returnTo, 'mesaj', 'Oturum sonlandırıldı.'))
}

export async function revokeAllSessionsAction(formData: FormData) {
  const ctx = await requirePlatformPermission('users.revoke_session')
  const userId = field(formData, 'userId')
  const clinicId = field(formData, 'clinicId') || null
  const returnTo = safeReturnTo(formData, `/kullanicilar/${encodeURIComponent(userId)}`)
  const request = await getPlatformRequestMetadata()
  let revokedCount = 0
  try {
    const result = await revokeAllUserSessionsForPlatform(db, { ...request, actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, userId, clinicId })
    revokedCount = result.count
  } catch (error) {
    await insertPlatformAuditLog(db, { actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, action: 'user.sessions.revoked_all', entityType: 'user', entityId: userId, clinicId, outcome: 'failure', reason: error instanceof Error ? error.message : 'Bilinmeyen hata', ...request })
    redirect(withMessage(returnTo, 'hata', 'Oturumlar sonlandırılamadı.'))
  }
  redirect(withMessage(returnTo, 'mesaj', `${revokedCount} normal oturum sonlandırıldı.`))
}

export async function sendPasswordResetAction(formData: FormData) {
  const ctx = await requirePlatformPermission('users.send_password_reset')
  const userId = field(formData, 'userId')
  const returnTo = safeReturnTo(formData, `/kullanicilar/${encodeURIComponent(userId)}`)
  const request = await getPlatformRequestMetadata()
  try {
    const user = await getUserForPlatform(db, userId)
    if (!user) throw new Error('Kullanıcı bulunamadı.')
    if (await hasRecentPasswordResetRequest(db, userId, new Date(Date.now() - PASSWORD_RESET_COOLDOWN_MS))) {
      throw new Error('Şifre sıfırlama e-postası 60 saniyede bir gönderilebilir.')
    }
    const webOrigin = process.env.OGUN_WEB_URL
    if (!webOrigin) throw new Error('OGUN_WEB_URL tanımlı değil.')
    await requestUserPasswordReset({ webOrigin, email: user.email })
    await insertPlatformAuditLog(db, { actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, action: 'user.password_reset.requested', entityType: 'user', entityId: user.id, outcome: 'success', ...request })
  } catch (error) {
    await insertPlatformAuditLog(db, { actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, action: 'user.password_reset.failed', entityType: 'user', entityId: userId || null, outcome: 'failure', reason: error instanceof Error ? error.message : 'Bilinmeyen hata', ...request })
    redirect(withMessage(returnTo, 'hata', error instanceof Error ? error.message : 'İstek gönderilemedi.'))
  }
  redirect(withMessage(returnTo, 'mesaj', 'E-posta gönderildi. 60 saniye içinde yeniden gönderilemez.'))
}

export async function revokeDeviceAction(formData: FormData) {
  const ctx = await requirePlatformPermission('devices.manage')
  const deviceId = field(formData, 'deviceId')
  const reason = field(formData, 'reason')
  const clinicId = field(formData, 'clinicId') || null
  const returnTo = safeReturnTo(formData, '/klinikler')
  const request = await getPlatformRequestMetadata()
  try {
    if (reason.length < 3) throw new Error('Cihaz erişiminin kaldırılma nedeni zorunludur.')
    await revokeDeviceForPlatform(db, { ...request, actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, deviceId, reason, clinicId })
  } catch (error) {
    await insertPlatformAuditLog(db, { actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, action: 'device.revoked', entityType: 'device', entityId: deviceId, clinicId, outcome: 'failure', reason: error instanceof Error ? error.message : 'Bilinmeyen hata', ...request })
    redirect(withMessage(returnTo, 'hata', error instanceof Error ? error.message : 'Cihaz iptal edilemedi.'))
  }
  redirect(withMessage(returnTo, 'mesaj', 'Cihaz erişimi kaldırıldı ve bağlı normal oturumlar kapatıldı.'))
}

export async function reactivateDeviceAction(formData: FormData) {
  const ctx = await requirePlatformPermission('devices.manage')
  const deviceId = field(formData, 'deviceId')
  const clinicId = field(formData, 'clinicId') || null
  const returnTo = safeReturnTo(formData, '/klinikler')
  const request = await getPlatformRequestMetadata()
  try {
    await reactivateDeviceForPlatform(db, { ...request, actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, deviceId, clinicId })
  } catch (error) {
    await insertPlatformAuditLog(db, { actorUserId: ctx.user.id, platformStaffId: ctx.staff.id, action: 'device.reactivated', entityType: 'device', entityId: deviceId, clinicId, outcome: 'failure', reason: error instanceof Error ? error.message : 'Bilinmeyen hata', ...request })
    redirect(withMessage(returnTo, 'hata', 'Cihaz yeniden etkinleştirilemedi.'))
  }
  redirect(withMessage(returnTo, 'mesaj', 'Cihaz yeniden etkinleştirildi.'))
}
