// Faturalama sorguları — GitHub issue #40 / Prompt 7.2. clients.ts / appointments.ts
// üstündeki notla AYNI desen: clinicId burada düz bir string, "clinicId'siz
// sorgu yazılamaz" kuralı apps/web/src/lib/authz.ts (ClinicScope) tarafında
// tip seviyesinde zorlanıyor. Aggregasyon (aylık gelir/gider, diyetisyen
// bazlı ciro, kalan seans uyarısı) BİLİNÇLİ olarak BURADA değil —
// apps/web/src/lib/billing/ altında SAF (framework'ten bağımsız, DB'siz test
// edilebilir) fonksiyonlarda hesaplanıyor, tıpkı scheduling.ts'in çakışma
// kontrolünü appointments.ts sorgularından AYRI tutması gibi. Bu dosya
// SADECE ham satırları getirir/yazar.
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { billingPackages, clientPackages, expenses, payments, type ClientPackageStatus, type PaymentMethod } from '../schema/billing'
import { clients } from '../schema/clients'
import { users } from '../schema/tenancy'
import type { Database } from '../client'

// --- packages (paket TANIMLARI) ---------------------------------------------

export async function listBillingPackages(db: Database, clinicId: string) {
  return db
    .select()
    .from(billingPackages)
    .where(eq(billingPackages.clinicId, clinicId))
    .orderBy(desc(billingPackages.isActive), asc(billingPackages.name))
}

export async function getBillingPackageById(db: Database, clinicId: string, packageId: string) {
  const [row] = await db
    .select()
    .from(billingPackages)
    .where(and(eq(billingPackages.id, packageId), eq(billingPackages.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

export interface CreateBillingPackageInput {
  id?: string
  name: string
  sessionCount: number
  price: string
  validityDays?: number | null
}

export async function createBillingPackage(db: Database, clinicId: string, input: CreateBillingPackageInput) {
  const [row] = await db
    .insert(billingPackages)
    .values({ clinicId, ...input })
    .returning()
  if (!row) throw new Error('Paket oluşturulamadı.')
  return row
}

export interface UpdateBillingPackageInput {
  name?: string
  sessionCount?: number
  price?: string
  validityDays?: number | null
  isActive?: boolean
}

export async function updateBillingPackage(
  db: Database,
  clinicId: string,
  packageId: string,
  patch: UpdateBillingPackageInput,
) {
  const [row] = await db
    .update(billingPackages)
    .set(patch)
    .where(and(eq(billingPackages.id, packageId), eq(billingPackages.clinicId, clinicId)))
    .returning()
  return row ?? null
}

// --- client_packages (danışanın SATIN ALDIĞI paket) -------------------------

export interface ClientPackageRow {
  id: string
  clientId: string
  packageId: string
  packageName: string
  sessionCount: number
  purchasedAt: Date
  price: string
  sessionsUsed: number
  expiresAt: Date | null
  status: ClientPackageStatus
}

const clientPackageSelection = {
  id: clientPackages.id,
  clientId: clientPackages.clientId,
  packageId: clientPackages.packageId,
  packageName: billingPackages.name,
  sessionCount: billingPackages.sessionCount,
  purchasedAt: clientPackages.purchasedAt,
  price: clientPackages.price,
  sessionsUsed: clientPackages.sessionsUsed,
  expiresAt: clientPackages.expiresAt,
  status: clientPackages.status,
}

export async function listClientPackagesForClient(
  db: Database,
  clinicId: string,
  clientId: string,
): Promise<ClientPackageRow[]> {
  return db
    .select(clientPackageSelection)
    .from(clientPackages)
    .innerJoin(billingPackages, eq(billingPackages.id, clientPackages.packageId))
    .where(and(eq(clientPackages.clientId, clientId), eq(billingPackages.clinicId, clinicId)))
    .orderBy(desc(clientPackages.purchasedAt))
}

// Randevu ekranındaki "kalan seans" uyarısı VE randevu oluşturma ("hangi
// paketten düşülecek") İÇİN — danışanın en son satın aldığı 'aktif'
// durumdaki paketi döner (bkz. GÖREV 2, appointments.ts packageSessionId
// notu).
export async function getActiveClientPackageForClient(
  db: Database,
  clinicId: string,
  clientId: string,
): Promise<ClientPackageRow | null> {
  const [row] = await db
    .select(clientPackageSelection)
    .from(clientPackages)
    .innerJoin(billingPackages, eq(billingPackages.id, clientPackages.packageId))
    .where(
      and(
        eq(clientPackages.clientId, clientId),
        eq(billingPackages.clinicId, clinicId),
        eq(clientPackages.status, 'aktif'),
      ),
    )
    .orderBy(desc(clientPackages.purchasedAt))
    .limit(1)
  return row ?? null
}

export interface PurchaseClientPackageInput {
  clientId: string
  packageId: string
  price: string
  purchasedAt?: Date
}

// Danışana yeni bir paket satışı — fiyatı (billingPackages.price'tan değil)
// AYRICA parametre olarak alır: diyetisyen pazarlık/indirim uygulayabilir,
// satır SATIN ALMA anındaki gerçek tutarı taşımalı (bkz. schema/billing.ts
// clientPackages.price üstündeki not). expiresAt, paketin validityDays'inden
// TÜRETİLİR — paket süresizse (validityDays NULL) expiresAt de NULL kalır.
export async function purchaseClientPackage(db: Database, clinicId: string, input: PurchaseClientPackageInput) {
  const pkg = await getBillingPackageById(db, clinicId, input.packageId)
  if (!pkg) throw new Error('Paket bulunamadı.')

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!client) throw new Error('Danışan bulunamadı veya bu kliniğe ait değil.')

  const purchasedAt = input.purchasedAt ?? new Date()
  const expiresAt =
    pkg.validityDays !== null ? new Date(purchasedAt.getTime() + pkg.validityDays * 24 * 60 * 60 * 1000) : null

  const [row] = await db
    .insert(clientPackages)
    .values({
      clientId: input.clientId,
      packageId: input.packageId,
      purchasedAt,
      price: input.price,
      expiresAt,
    })
    .returning()
  if (!row) throw new Error('Paket satın alma kaydedilemedi.')
  return row
}

export async function updateClientPackageStatus(
  db: Database,
  clinicId: string,
  clientPackageId: string,
  status: ClientPackageStatus,
) {
  // İki adımlı doğrulama (JOIN'li UPDATE yerine) — clientPackages'ın kendisinde
  // clinicId YOK (bkz. schema/billing.ts, klinik bilgisi billingPackages
  // üzerinden dolaylı), bu yüzden önce "bu client_package satırı gerçekten bu
  // kliniğin bir paketine mi ait" sorgusu, sonra tekil id'ye göre UPDATE.
  const [owned] = await db
    .select({ id: clientPackages.id })
    .from(clientPackages)
    .innerJoin(billingPackages, eq(billingPackages.id, clientPackages.packageId))
    .where(and(eq(clientPackages.id, clientPackageId), eq(billingPackages.clinicId, clinicId)))
    .limit(1)
  if (!owned) return null

  const [row] = await db
    .update(clientPackages)
    .set({ status })
    .where(eq(clientPackages.id, clientPackageId))
    .returning()
  return row ?? null
}

// Bir randevu 'geldi' işaretlendiğinde (bkz. randevular/actions.ts
// updateAppointmentStatusAction) buradan çağrılır — sessionsUsed BİR ARTAR,
// paket tükenmişse (sessionsUsed === sessionCount) status 'tamamlandı'ya
// geçer. Randevu PLANLANIRKEN değil, danışan GERÇEKTEN geldiğinde tüketilir
// (no-show/iptal bir seans harcamaz — bkz appointments.ts notu).
export async function consumeClientPackageSession(db: Database, clinicId: string, clientPackageId: string) {
  const [existing] = await db
    .select({
      id: clientPackages.id,
      sessionsUsed: clientPackages.sessionsUsed,
      sessionCount: billingPackages.sessionCount,
      clinicId: billingPackages.clinicId,
    })
    .from(clientPackages)
    .innerJoin(billingPackages, eq(billingPackages.id, clientPackages.packageId))
    .where(eq(clientPackages.id, clientPackageId))
    .limit(1)

  if (!existing || existing.clinicId !== clinicId) return null

  const nextUsed = existing.sessionsUsed + 1
  const nextStatus: ClientPackageStatus = nextUsed >= existing.sessionCount ? 'tamamlandı' : 'aktif'

  const [row] = await db
    .update(clientPackages)
    .set({ sessionsUsed: nextUsed, status: nextStatus })
    .where(eq(clientPackages.id, clientPackageId))
    .returning()
  return row ?? null
}

// --- payments -----------------------------------------------------------

export interface PaymentListRow {
  id: string
  clientId: string
  clientFirstName: string
  clientLastName: string
  clientPackageId: string | null
  amount: string
  method: PaymentMethod
  paidAt: Date
  notes: string | null
  receiptNumber: string | null
  receiptSeries: string | null
  receiptSequenceNumber: string | null
  receiptIssuedAt: string | null
  dietitianId: string | null
  dietitianName: string | null
}

const paymentListSelection = {
  id: payments.id,
  clientId: payments.clientId,
  clientFirstName: clients.firstName,
  clientLastName: clients.lastName,
  clientPackageId: payments.clientPackageId,
  amount: payments.amount,
  method: payments.method,
  paidAt: payments.paidAt,
  notes: payments.notes,
  receiptNumber: payments.receiptNumber,
  receiptSeries: payments.receiptSeries,
  receiptSequenceNumber: payments.receiptSequenceNumber,
  receiptIssuedAt: payments.receiptIssuedAt,
  dietitianId: clients.assignedDietitianId,
  dietitianName: users.name,
}

export async function listPaymentsForClient(db: Database, clinicId: string, clientId: string): Promise<PaymentListRow[]> {
  return db
    .select(paymentListSelection)
    .from(payments)
    .innerJoin(clients, eq(clients.id, payments.clientId))
    .leftJoin(users, eq(users.id, clients.assignedDietitianId))
    .where(and(eq(payments.clinicId, clinicId), eq(payments.clientId, clientId)))
    .orderBy(desc(payments.paidAt))
}

// Finans paneli (GÖREV 3) — aylık gelir/gider VE diyetisyen bazlı ciro İÇİN
// tek sorgu: [from, to) aralığındaki TÜM klinik ödemeleri, diyetisyen adıyla
// BİRLİKTE (assignedDietitianId üzerinden — bkz. apps/web/src/lib/billing/
// finance-aggregation.ts revenueByDietitian, "basit tut" kuralı gereği
// randevunun kendi dietitianId'si değil danışanın atanan diyetisyeni
// kullanılıyor, appointments tablosuna JOIN gerekmiyor).
export async function listPaymentsForClinicInRange(
  db: Database,
  clinicId: string,
  range: { from: Date; to: Date },
): Promise<PaymentListRow[]> {
  return db
    .select(paymentListSelection)
    .from(payments)
    .innerJoin(clients, eq(clients.id, payments.clientId))
    .leftJoin(users, eq(users.id, clients.assignedDietitianId))
    .where(and(eq(payments.clinicId, clinicId), gte(payments.paidAt, range.from), lte(payments.paidAt, range.to)))
    .orderBy(desc(payments.paidAt))
}

export interface CreatePaymentInput {
  id?: string
  clientId: string
  clientPackageId?: string | null
  amount: string
  method: PaymentMethod
  paidAt?: Date
  notes?: string | null
  receiptNumber?: string | null
  receiptSeries?: string | null
  receiptSequenceNumber?: string | null
  receiptIssuedAt?: string | null
}

export async function createPayment(db: Database, clinicId: string, input: CreatePaymentInput) {
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.clinicId, clinicId)))
    .limit(1)
  if (!client) throw new Error('Danışan bulunamadı.')

  if (input.clientPackageId) {
    const [clientPackage] = await db
      .select({ id: clientPackages.id })
      .from(clientPackages)
      .innerJoin(billingPackages, eq(billingPackages.id, clientPackages.packageId))
      .where(
        and(
          eq(clientPackages.id, input.clientPackageId),
          eq(clientPackages.clientId, input.clientId),
          eq(billingPackages.clinicId, clinicId),
        ),
      )
      .limit(1)
    if (!clientPackage) throw new Error('Seçilen paket bu danışana ait değil.')
  }

  const [row] = await db
    .insert(payments)
    .values({ clinicId, ...input })
    .returning()
  if (!row) throw new Error('Ödeme kaydedilemedi.')
  return row
}

export async function deletePayment(db: Database, clinicId: string, paymentId: string) {
  await db.delete(payments).where(and(eq(payments.id, paymentId), eq(payments.clinicId, clinicId)))
}

// --- expenses (basit gider takibi) ------------------------------------------

export interface CreateExpenseInput {
  id?: string
  category: string
  amount: string
  date: string
  description?: string | null
}

export async function createExpense(db: Database, clinicId: string, input: CreateExpenseInput) {
  const [row] = await db
    .insert(expenses)
    .values({ clinicId, ...input })
    .returning()
  if (!row) throw new Error('Gider kaydedilemedi.')
  return row
}

export async function getExpenseById(db: Database, clinicId: string, expenseId: string) {
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.clinicId, clinicId)))
    .limit(1)
  return row ?? null
}

export async function listExpensesForClinicInRange(db: Database, clinicId: string, range: { from: string; to: string }) {
  return db
    .select()
    .from(expenses)
    .where(and(eq(expenses.clinicId, clinicId), gte(expenses.date, range.from), lte(expenses.date, range.to)))
    .orderBy(desc(expenses.date))
}

export async function deleteExpense(db: Database, clinicId: string, expenseId: string) {
  await db.delete(expenses).where(and(eq(expenses.id, expenseId), eq(expenses.clinicId, clinicId)))
}

// --- Tahsil edilmemiş alacaklar (GÖREV 3) -----------------------------------

// Klinik genelinde 'aktif' + 'tamamlandı' durumdaki TÜM client_packages
// satırları — apps/web/src/lib/billing/finance-aggregation.ts
// uncollectedReceivables bunları o pakete ait ödemelerle eşleştirip
// (price - toplam ödeme) farkını toplar. 'iptal' edilen paketler alacak
// SAYILMAZ (iş kuralı: iptal edilen bir paketin tahsilat beklentisi yok).
export async function listClientPackagesForClinic(db: Database, clinicId: string): Promise<ClientPackageRow[]> {
  return db
    .select(clientPackageSelection)
    .from(clientPackages)
    .innerJoin(billingPackages, eq(billingPackages.id, clientPackages.packageId))
    .where(and(eq(billingPackages.clinicId, clinicId), inArray(clientPackages.status, ['aktif', 'tamamlandı'])))
    .orderBy(desc(clientPackages.purchasedAt))
}

export async function listPaymentsForClientPackages(
  db: Database,
  clinicId: string,
  clientPackageIds: string[],
): Promise<{ clientPackageId: string | null; amount: string }[]> {
  if (clientPackageIds.length === 0) return []
  return db
    .select({ clientPackageId: payments.clientPackageId, amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.clinicId, clinicId), inArray(payments.clientPackageId, clientPackageIds)))
}
