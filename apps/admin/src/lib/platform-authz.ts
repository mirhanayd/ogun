import 'server-only'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import { getPlatformStaffByUserId } from '@ogun/db/queries'
import type { PlatformStaffRole } from '@ogun/db/schema'
import { auth } from './auth'
import { evaluatePlatformAccess } from './platform-access'
import {
  permissionsForRole,
  roleHasPermission,
  type PlatformPermission,
} from './platform-permissions'

export class PlatformAccessError extends Error {
  constructor(
    public readonly reason: 'unauthenticated' | 'not_staff' | 'inactive' | 'mfa_required' | 'forbidden',
  ) {
    super(reason === 'mfa_required' ? 'İki aşamalı doğrulama zorunludur.' : 'Platform erişimi reddedildi.')
    this.name = 'PlatformAccessError'
  }
}

export interface PlatformStaffContext {
  user: { id: string; email: string; name: string }
  sessionId: string
  staff: { id: string; role: PlatformStaffRole }
  permissions: readonly PlatformPermission[]
  mfaEnabled: boolean
}

export async function requirePlatformStaff(options: { allowUnenrolled?: boolean } = {}): Promise<PlatformStaffContext> {
  const session = await auth.api.getSession({ headers: await headers() })
  const staff = session ? await getPlatformStaffByUserId(db, session.user.id) : null
  const decision = evaluatePlatformAccess({
    authenticated: Boolean(session),
    staff,
    twoFactorEnabled: Boolean(session?.user.twoFactorEnabled),
    allowUnenrolled: options.allowUnenrolled,
  })
  if (!decision.allowed) throw new PlatformAccessError(decision.reason)
  if (!session || !staff) throw new PlatformAccessError('unauthenticated')
  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    sessionId: session.session.id,
    staff: { id: staff.id, role: staff.role },
    permissions: permissionsForRole(staff.role),
    mfaEnabled: Boolean(session.user.twoFactorEnabled),
  }
}

export async function requirePlatformPermission(permission: PlatformPermission) {
  const ctx = await requirePlatformStaff()
  if (!roleHasPermission(ctx.staff.role, permission)) throw new PlatformAccessError('forbidden')
  return ctx
}

export function withPlatformPermission<Args extends unknown[], Result>(
  permission: PlatformPermission,
  action: (ctx: PlatformStaffContext, ...args: Args) => Promise<Result>,
) {
  return async (...args: Args) => action(await requirePlatformPermission(permission), ...args)
}
