import 'server-only'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import { updateSessionActiveClinic } from '@ogun/db/queries'
import { auth } from './auth'
import type { ClinicMemberRole } from '@ogun/db/schema'

// ---------------------------------------------------------------------------
// Hata tipleri
// ---------------------------------------------------------------------------

export class UnauthenticatedError extends Error {
  constructor(message = 'Oturum bulunamadı, lütfen giriş yapın.') {
    super(message)
    this.name = 'UnauthenticatedError'
  }
}

export class NoActiveClinicError extends Error {
  constructor(message = 'Aktif bir klinik seçilmedi.') {
    super(message)
    this.name = 'NoActiveClinicError'
  }
}

export class InsufficientRoleError extends Error {
  constructor(message = 'Bu işlem için yetkiniz yok.') {
    super(message)
    this.name = 'InsufficientRoleError'
  }
}

// ---------------------------------------------------------------------------
// ClinicScope — KURAL: Danışan verisine erişen HER sorgu clinicId ile
// filtrelenir. Bunu tip seviyesinde zorlamak için:
//
// ClinicScope, çıplak bir `string` değil, gizli (dışa aktarılmayan) bir
// sembolle markalanmış (branded) bir tiptir. Bu paket dışından hiç kimse
// `{ clinicId: "...", [brand]: true }` şeklinde elle bir ClinicScope
// üretemez — TypeScript yapısal olarak bunu reddeder, çünkü marka
// sembolüne erişimi yoktur. ClinicScope'un TEK üretim yolu requireClinic()
// / requireRole() üzerinden, yani gerçek bir oturum + klinik üyeliği
// doğrulamasından geçmektir.
//
// Sonuç: danışan (client) verisine dokunan sorgu fonksiyonları imzalarını
// `(db: Database, scope: ClinicScope, ...) => ...` şeklinde yazmalıdır
// (bkz. packages/db/src/queries/clients.ts — GitHub issue #17 / Prompt 4.1).
// Böyle bir fonksiyonu, requireClinic()'ten geçmeden, sadece elindeki bir
// clinicId string'iyle çağırmaya çalışan kod DERLENMEZ — çünkü `string`,
// `ClinicScope`'a atanamaz. Bu, "clinicId almayan bir client sorgusu
// yazılamasın" kuralını, çalışma zamanı kontrolü yerine tip sisteminde
// zorunlu kılar.
// GitHub issue #45 / Prompt 8.1 — GERÇEK bir hata düzeltmesi (bu satırın
// kendisiyle İLGİSİZ görünen bir "kalite" issue'sunda bulundu): `declare
// const` SADECE TypeScript'in tip denetleyicisine "bu bir yerde tanımlı"
// diye bir SÖZ verir, gerçek bir çalışma zamanı (runtime) değeri ÜRETMEZ.
// Aşağıdaki toClinicScope() ise `[clinicScopeBrand]: true`'yu GERÇEK bir
// obje literalinde, ÇALIŞMA ZAMANINDA computed property key olarak
// kullanıyor — derlenmiş JS'te `clinicScopeBrand` hiçbir yerde
// tanımlanmadığı için bu `ReferenceError: clinicScopeBrand is not defined`
// ile PATLAR. Vitest birim testleri requireClinic()/toClinicScope()'u
// GERÇEKTEN çağırmadığı (mock ClinicContext kullandıkları) ve Turbopack
// dev/build bu koda ulaşamadan başka hatalarla durduğu için bu şimdiye
// kadar YAKALANAMAMIŞTI — bu issue'nun E2E testleri (bkz. apps/e2e), bir
// oturumu GERÇEKTEN /panel'e kadar götüren İLK çalıştırma oldu ve
// requireClinic()'e giden HER istekte (danışan listesi, klinik seçimi,
// panel) bunu tetikledi. Düzeltme: `unique symbol` tipini GERÇEK bir
// `Symbol()` çalışma zamanı değerine bağlamak — marka (branding) deseni
// aynen korunuyor (sembol hâlâ dışa aktarılmıyor), sadece artık GERÇEKTEN
// var.
const clinicScopeBrand: unique symbol = Symbol('clinicScope')
export interface ClinicScope {
  readonly clinicId: string
  readonly [clinicScopeBrand]: true
}

function toClinicScope(clinicId: string): ClinicScope {
  return { clinicId, [clinicScopeBrand]: true } as ClinicScope
}

// ---------------------------------------------------------------------------
// Oturum context'i
// ---------------------------------------------------------------------------

export interface AuthContext {
  user: { id: string; email: string; name: string }
  sessionId: string
}

export interface ClinicContext extends AuthContext {
  scope: ClinicScope
  role: ClinicMemberRole
}

async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

// Sadece geçerli bir oturum ister — klinik seçimi şart değildir (ör. /kurulum
// akışı, henüz hiçbir klinikte üye olmayan yeni kayıtlı kullanıcı için).
export async function requireAuth(): Promise<AuthContext> {
  const session = await getSession()
  if (!session) {
    throw new UnauthenticatedError()
  }
  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    sessionId: session.session.id,
  }
}

// Geçerli bir oturum VE oturuma bağlı bir aktif klinik (activeClinicId) ister.
// Danışan verisine dokunan her server action bunu (veya requireRole'u)
// çağırmalı ve dönen `scope`'u sorgu fonksiyonlarına iletmelidir.
export async function requireClinic(): Promise<ClinicContext> {
  const session = await getSession()
  if (!session) {
    throw new UnauthenticatedError()
  }
  const clinicId = session.session.activeClinicId
  const role = session.session.role
  if (!clinicId || !role) {
    throw new NoActiveClinicError()
  }
  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    sessionId: session.session.id,
    scope: toClinicScope(clinicId),
    role: role as ClinicMemberRole,
  }
}

// requireClinic() + rol kontrolü. Örn: requireRole('owner', 'dietitian')
export async function requireRole(...allowedRoles: ClinicMemberRole[]): Promise<ClinicContext> {
  const ctx = await requireClinic()
  if (!allowedRoles.includes(ctx.role)) {
    throw new InsufficientRoleError()
  }
  return ctx
}

// Aktif oturuma bir klinik + rol bağlar. İki yerden çağrılır:
//  1. Onboarding'in son adımı (bkz. app/kurulum/actions.ts) — kullanıcı ilk
//     kliniğini kurduğunda.
//  2. Üst bar klinik seçici (bkz. app/(app)/actions.ts switchClinicAction) —
//     birden fazla klinikte üye olan kullanıcı aktif kliniği değiştirdiğinde.
//
// ÖNEMLİ: çağıran taraf, clinicId'nin kullanıcının GERÇEKTEN üyesi olduğu bir
// klinik olduğunu (clinic_members'tan) doğrulamış olmalı — bu fonksiyon sadece
// session satırını günceller, yetki kontrolü yapmaz.
//
// lib/auth.ts'te cookie cache AÇIK DEĞİL — yani her getSession() çağrısı
// veritabanına gidiyor. Bu yüzden sessions satırını doğrudan güncellemek
// yeterli; ayrı bir "session refresh" API'sine ihtiyaç yok, bir sonraki
// getSession() zaten güncel activeClinicId/role'ü görecek.
export async function setActiveClinic(clinicId: string, role: ClinicMemberRole): Promise<void> {
  const session = await getSession()
  if (!session) {
    throw new UnauthenticatedError()
  }
  await updateSessionActiveClinic(db, session.session.id, clinicId, role)
}

// ---------------------------------------------------------------------------
// Server action sarmalayıcısı
// ---------------------------------------------------------------------------

// Bir server action'ı klinik bazlı yetkilendirme ile sarmalar: action'ın ilk
// parametresi olarak her zaman doğrulanmış bir ClinicContext (dolayısıyla
// ClinicScope) enjekte eder. `roles` verilirse requireRole, verilmezse
// requireClinic kullanılır.
//
// Kullanım:
//   export const archiveClient = withAuth(async (ctx, clientId: string) => {
//     await archiveClientQuery(db, ctx.scope, clientId)
//   })
export function withAuth<Args extends unknown[], Result>(
  action: (ctx: ClinicContext, ...args: Args) => Promise<Result>,
  roles?: ClinicMemberRole[],
) {
  return async (...args: Args): Promise<Result> => {
    const ctx = roles && roles.length > 0 ? await requireRole(...roles) : await requireClinic()
    return action(ctx, ...args)
  }
}
