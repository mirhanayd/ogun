import 'server-only'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import {
  clientIdForAppointment,
  clientIdForClientPackage,
  clientIdForDocument,
  clientIdForGoal,
  clientIdForLabResult,
  clientIdForPlan,
  clientIdForPlanAlternative,
  clientIdForPlanDay,
  clientIdForPlanItem,
  clientIdForPlanMeal,
  clientIdForPlanShare,
  getClinicMembership,
  getClientById,
  listClinicMembershipsForUser,
  updateSessionActiveClinic,
} from '@ogun/db/queries'
import { auth } from './auth'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { canAccessClientRecord } from './client-access'
import { reconcileActiveClinicSession } from './auth-session-fields'

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

// GitHub issue #67 — kullanıcı BİRDEN FAZLA klinikte üye ve oturumun aktif
// kliniği henüz seçilmemişse hangisiyle devam edileceği OTOMATİK
// belirlenemez; bu durumda klinik seçim ekranına (/klinik-sec) yönlendirilir.
// NoActiveClinicError'dan AYRI bir tip olmasının nedeni: o hata "hiç kliniğin
// yok, kurulum sihirbazına git" anlamına geliyor ve /kurulum'a yönlendiriyor —
// birden fazla kliniği OLAN bir kullanıcıyı sihirbaza göndermek YANLIŞ olurdu.
export class ClinicSelectionRequiredError extends Error {
  constructor(message = 'Devam etmek için bir klinik seçin.') {
    super(message)
    this.name = 'ClinicSelectionRequiredError'
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
  const activateSoleMembership = async (): Promise<ClinicContext> => {
    // GitHub issue #67 — GERÇEK VE BLOKLAYAN BİR HATA DÜZELTMESİ.
    // sessions.activeClinicId'yi bugüne kadar SADECE iki yer yazıyordu
    // (onboarding sihirbazının son adımı ve üst bardaki klinik seçici, bkz.
    // setActiveClinic altındaki not) — GİRİŞİN KENDİSİ HİÇBİR ZAMAN. Oturum
    // ise her girişte SIFIRDAN oluşuyor. Sonuç: kliniği ÇOKTAN kurulmuş bir
    // kullanıcı bile her yeni girişinde activeClinicId'si NULL bir oturumla
    // geliyor, requireClinic() burada patlıyor ve (app)/layout.tsx kullanıcıyı
    // /kurulum'a atıyordu — yani HER TAZE GİRİŞ uygulamanın kendisi yerine
    // kurulum sihirbazına düşüyordu (demo hesabı dahil).
    //
    // Düzeltme, oturumun eksik alanını kullanıcının GERÇEK üyeliklerinden
    // türetmek: clinic_members satırı ZATEN "onboarding tamamlandı" demektir
    // (bkz. app/kurulum/actions.ts — üyelik satırı sihirbazın SON adımında
    // yazılır), dolayısıyla tek üyelik varsa seçim yapılacak bir şey yoktur.
    // Bu, klinik seçicinin yaptığının AYNISI (aynı iki sütun), sadece
    // kullanıcıdan gereksiz bir tık istemeden.
    const memberships = await listClinicMembershipsForUser(db, session.user.id)
    if (memberships.length === 0) {
      throw new NoActiveClinicError()
    }
    if (memberships.length > 1) {
      throw new ClinicSelectionRequiredError()
    }
    const only = memberships[0]!
    // lib/auth.ts'te cookie cache KAPALI — bir sonraki getSession() bu satırı
    // veritabanından okuyacağı için oturum satırını güncellemek yeterli
    // (bkz. setActiveClinic üstündeki aynı not).
    await updateSessionActiveClinic(db, session.session.id, only.clinicId, only.role)
    return {
      user: { id: session.user.id, email: session.user.email, name: session.user.name },
      sessionId: session.session.id,
      scope: toClinicScope(only.clinicId),
      role: only.role,
    }
  }

  const activeClinicId = session.session.activeClinicId
  if (!activeClinicId) return activateSoleMembership()

  // Session alanları yalnızca bir seçim önbelleğidir, yetki kaynağı değildir.
  // Her yetkili istekte activeClinicId'nin kullanıcıya ait gerçek üyeliğini
  // ve rolünü DB'den yeniden doğrularız. Böylece eski/manipüle edilmiş bir
  // session rolü owner yetkisi veremez ve bilinen bir başka clinicId ile
  // cross-tenant erişim kurulamaz.
  const membership = await getClinicMembership(db, activeClinicId, session.user.id)
  const reconciled = reconcileActiveClinicSession(
    { activeClinicId, role: session.session.role },
    membership,
  )
  if (!reconciled) return activateSoleMembership()

  if (reconciled.needsSync) {
    await updateSessionActiveClinic(
      db,
      session.session.id,
      reconciled.clinicId,
      reconciled.role,
    )
  }

  return {
    user: { id: session.user.id, email: session.user.email, name: session.user.name },
    sessionId: session.session.id,
    scope: toClinicScope(reconciled.clinicId),
    role: reconciled.role,
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
// Savunma derinliği: çağıran ekran üyeliği önceden kontrol etse bile bu
// merkezi fonksiyon hedef clinicId'yi yeniden clinic_members üzerinden
// doğrular ve rolü istemci/çağıran argümanından değil DB kaydından alır.
//
// lib/auth.ts'te cookie cache AÇIK DEĞİL — yani her getSession() çağrısı
// veritabanına gidiyor. Bu yüzden sessions satırını doğrudan güncellemek
// yeterli; ayrı bir "session refresh" API'sine ihtiyaç yok, bir sonraki
// getSession() zaten güncel activeClinicId/role'ü görecek.
export async function setActiveClinic(clinicId: string): Promise<void> {
  const session = await getSession()
  if (!session) {
    throw new UnauthenticatedError()
  }
  const membership = await getClinicMembership(db, clinicId, session.user.id)
  if (!membership) {
    throw new InsufficientRoleError('Bu kliniğe erişiminiz yok.')
  }
  await updateSessionActiveClinic(db, session.session.id, clinicId, membership.role)
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

// Davetli diyetisyenler yalnızca kendilerine atanmış danışanlara erişebilir.
// Liste sorgusu ayrıca filtrelense de doğrudan detay/action çağrılarının URL
// tahminiyle bu sınırı aşmaması için clientId alan sunucu işlemleri bu yardımcıyı
// kullanır. Owner ve assistant'ın mevcut klinik kapsamı davranışı korunur.
export async function assertClientAccess(ctx: ClinicContext, clientId: string): Promise<void> {
  const client = await getClientById(db, ctx.scope.clinicId, clientId)
  // Her rol için önce tenant sahipliği doğrulanır. Owner/assistant'ın atama
  // kısıtı yoktur ama başka kliniğin clientId'siyle ilişkili kayıt yaratması
  // veya mutasyon yapması yine de kesinlikle engellenmelidir.
  if (!client) {
    throw new InsufficientRoleError('Danışan bulunamadı veya bu kliniğe ait değil.')
  }
  if (!canAccessClientRecord(client, { role: ctx.role, userId: ctx.user.id })) {
    throw new InsufficientRoleError('Bu danışan size atanmadı.')
  }
}

export function withClientAuth<Rest extends unknown[], Result>(
  action: (ctx: ClinicContext, clientId: string, ...args: Rest) => Promise<Result>,
  roles?: ClinicMemberRole[],
) {
  return async (clientId: string, ...args: Rest): Promise<Result> => {
    const ctx = roles && roles.length > 0 ? await requireRole(...roles) : await requireClinic()
    await assertClientAccess(ctx, clientId)
    return action(ctx, clientId, ...args)
  }
}

async function assertResolvedClientAccess(
  ctx: ClinicContext,
  resolve: () => Promise<string | null | undefined>,
): Promise<void> {
  const clientId = await resolve()
  if (clientId === undefined) throw new InsufficientRoleError('Kayıt bulunamadı veya erişiminiz yok.')
  // clientId=null klinik şablonudur; danışan sağlık verisi taşımaz ve tüm
  // klinik diyetisyenleri tarafından kullanılabilir.
  if (clientId === null) return
  await assertClientAccess(ctx, clientId)
}

export const assertPlanAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForPlan(db, ctx.scope.clinicId, id))

export const assertPlanDayAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForPlanDay(db, ctx.scope.clinicId, id))

export const assertPlanMealAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForPlanMeal(db, ctx.scope.clinicId, id))

export const assertPlanItemAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForPlanItem(db, ctx.scope.clinicId, id))

export const assertPlanAlternativeAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForPlanAlternative(db, ctx.scope.clinicId, id))

export const assertDocumentAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForDocument(db, ctx.scope.clinicId, id))

export const assertLabResultAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForLabResult(db, ctx.scope.clinicId, id))

export const assertGoalAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForGoal(db, ctx.scope.clinicId, id))

export const assertPlanShareAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForPlanShare(db, ctx.scope.clinicId, id))

export const assertClientPackageAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForClientPackage(db, ctx.scope.clinicId, id))

export const assertAppointmentAccess = (ctx: ClinicContext, id: string) =>
  assertResolvedClientAccess(ctx, () => clientIdForAppointment(db, ctx.scope.clinicId, id))
