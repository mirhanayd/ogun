import 'server-only'

import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import { asClinicId, type ClinicId } from '@ogun/db/queries'
import { auth } from './auth'

// ---------------------------------------------------------------------------
// Yetkilendirme katmanı.
//
// KURAL (#10): Danışan verisine dokunan her sorgu clinicId ile filtrelenir.
// requireClinic()/requireRole() dışında hiçbir yerde `ClinicId` üretilmez —
// bkz. packages/db/src/queries/clinic-scope.ts. Bu dosyadaki fonksiyonlar
// yalnızca ONAYLI (oturum açmış kullanıcının gerçekten üyesi olduğu) klinik
// id'lerini `ClinicId`'ye çevirir.
// ---------------------------------------------------------------------------

export type ClinicMemberRole = 'owner' | 'dietitian' | 'assistant'

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>

export type AuthContext = {
  userId: string
  email: string
  name: string
}

export type ClinicContext = AuthContext & {
  clinicId: ClinicId
  role: ClinicMemberRole
}

/** İstek başlıklarını Better Auth'un beklediği Headers nesnesine çevirir. */
async function getRequestHeaders(): Promise<Headers> {
  return nextHeaders()
}

async function getSessionOrRedirect() {
  const session = await auth.api.getSession({ headers: await getRequestHeaders() })

  if (!session) {
    redirect('/giris')
  }

  return session
}

/**
 * Oturum açmış kullanıcıyı döndürür. Oturum yoksa /giris sayfasına
 * yönlendirir (server component / server action içinden çağrılmalı).
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getSessionOrRedirect()

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  }
}

/**
 * requireAuth() + oturumdaki aktif klinik doğrulaması. Aktif klinik seçili
 * değilse (veya kullanıcı artık o klinikte üye değilse) /kurulum'a
 * yönlendirir. Başarılıysa, ClinicId ile filtrelenmiş sorgular için gereken
 * markalı `ClinicId` değerini üretir — bkz. packages/db/src/queries/clinic-scope.ts.
 */
export async function requireClinic(): Promise<ClinicContext> {
  const session = await getSessionOrRedirect()

  const activeClinicId = (session.session as { activeClinicId?: string | null }).activeClinicId
  const role = (session.session as { role?: ClinicMemberRole | null }).role

  if (!activeClinicId || !role) {
    // customSession eklentisi role'ü clinic_members üzerinden taze okur;
    // ikisinden biri boşsa kullanıcı bu klinikte artık üye değil demektir.
    redirect('/kurulum')
  }

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    clinicId: asClinicId(activeClinicId),
    role,
  }
}

/**
 * requireClinic() + rol kontrolü. İzin verilen roller listesinde değilse
 * 403 anlamına gelen bir hata fırlatır (route handler/server action bunu
 * yakalayıp uygun HTTP yanıtına çevirmeli).
 */
export async function requireRole(...allowedRoles: ClinicMemberRole[]): Promise<ClinicContext> {
  const clinicContext = await requireClinic()

  if (!allowedRoles.includes(clinicContext.role)) {
    throw new AuthorizationError(
      `Bu işlem için gerekli role sahip değilsiniz (gerekli: ${allowedRoles.join(', ')}, mevcut: ${clinicContext.role}).`,
    )
  }

  return clinicContext
}

export class AuthorizationError extends Error {
  constructor(message = 'Bu işlem için yetkiniz yok.') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

/**
 * Server action'ları için sarmalayıcı. Action'ın ilk parametresi olarak
 * doğrulanmış `ClinicContext`'i enjekte eder, böylece action gövdesinde
 * clinicId'yi unutmak mümkün olmaz — parametre olarak zaten elinizdedir.
 *
 * Kullanım:
 *   export const createClient = withAuth(async (ctx, input: NewClientInput) => {
 *     // ctx.clinicId burada ClinicId tipinde, garanti doğrulanmış
 *   })
 */
export function withAuth<Args extends unknown[], Result>(
  action: (ctx: ClinicContext, ...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    const ctx = await requireClinic()
    return action(ctx, ...args)
  }
}

/** Belirli rollerle sınırlı server action sarmalayıcısı. */
export function withRole<Args extends unknown[], Result>(
  allowedRoles: ClinicMemberRole[],
  action: (ctx: ClinicContext, ...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    const ctx = await requireClinic()
    if (!allowedRoles.includes(ctx.role)) {
      throw new AuthorizationError(
        `Bu işlem için gerekli role sahip değilsiniz (gerekli: ${allowedRoles.join(', ')}, mevcut: ${ctx.role}).`,
      )
    }
    return action(ctx, ...args)
  }
}
