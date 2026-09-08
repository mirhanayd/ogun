import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@ogun/db'
import { registerDesktopDevice } from '@ogun/db/queries'
import { auth } from '@/lib/auth'
import { hashInstallationId } from '@/lib/device-identity'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  platform: z.enum(['windows', 'macos', 'linux', 'unknown']),
  displayName: z.string().trim().min(1).max(80),
  appVersion: z.string().trim().min(1).max(40),
})

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const rawInstallationId = request.headers.get('x-ogun-device-id')
  if (!rawInstallationId) return NextResponse.json({ error: 'device_identity_required' }, { status: 400 })
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid_device_metadata' }, { status: 400 })
  let installationIdHash: string
  try { installationIdHash = hashInstallationId(rawInstallationId) }
  catch { return NextResponse.json({ error: 'invalid_device_identity' }, { status: 400 }) }
  const result = await registerDesktopDevice(db, {
    installationIdHash,
    userId: session.user.id,
    sessionId: session.session.id,
    ...parsed.data,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip'),
  })
  if (result.status === 'revoked') {
    return NextResponse.json({ error: 'device_access_revoked' }, { status: 403 })
  }
  return NextResponse.json({ status: 'active', registered: result.created })
}
