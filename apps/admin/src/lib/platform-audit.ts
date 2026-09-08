import 'server-only'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import { insertPlatformAuditLog, type PlatformAuditLogInput } from '@ogun/db/queries'
import type { PlatformStaffContext } from './platform-authz'

export type PlatformAuditRecorder = (input: PlatformAuditLogInput) => Promise<void>

export interface PlatformAuditDescriptor<Args extends unknown[], Result> {
  action: string
  entityType: string
  entityId?: (args: Args, result: Result | undefined) => string | null
  clinicId?: (args: Args, result: Result | undefined) => string | null
  metadata?: (args: Args, result: Result | undefined) => Record<string, unknown> | undefined
}

export async function recordPlatformAudit(input: PlatformAuditLogInput) {
  const requestMetadata = await getPlatformRequestMetadata()
  await insertPlatformAuditLog(db, {
    ...input,
    ...requestMetadata,
  })
}

export async function getPlatformRequestMetadata() {
  const requestHeaders = await headers()
  return {
    ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? requestHeaders.get('x-real-ip'),
    userAgent: requestHeaders.get('user-agent'),
  }
}

export function withPlatformAudit<Args extends unknown[], Result>(
  descriptor: PlatformAuditDescriptor<Args, Result>,
  action: (ctx: PlatformStaffContext, ...args: Args) => Promise<Result>,
  recorder: PlatformAuditRecorder = recordPlatformAudit,
) {
  return async (ctx: PlatformStaffContext, ...args: Args): Promise<Result> => {
    let result: Result | undefined
    try {
      result = await action(ctx, ...args)
    } catch (error) {
      await recorder({
        actorUserId: ctx.user.id,
        platformStaffId: ctx.staff.id,
        action: descriptor.action,
        entityType: descriptor.entityType,
        entityId: descriptor.entityId?.(args, result) ?? null,
        clinicId: descriptor.clinicId?.(args, result) ?? null,
        outcome: 'failure',
        reason: error instanceof Error ? error.message : 'Bilinmeyen hata',
        metadata: descriptor.metadata?.(args, result),
      })
      throw error
    }
    // Platform mutations are fail-closed with respect to audit persistence.
    // Callers that need atomic mutation+audit should perform both in one DB
    // transaction and use this wrapper for request metadata/orchestration.
    await recorder({
      actorUserId: ctx.user.id,
      platformStaffId: ctx.staff.id,
      action: descriptor.action,
      entityType: descriptor.entityType,
      entityId: descriptor.entityId?.(args, result) ?? null,
      clinicId: descriptor.clinicId?.(args, result) ?? null,
      outcome: 'success',
      metadata: descriptor.metadata?.(args, result),
    })
    return result
  }
}
