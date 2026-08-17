import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { clinicMembers, clinics, users, type ClinicMemberRole, type SubscriptionStatus } from '../schema'
import type { Database } from '../client'
import { normalizeSearchText } from '../lib/normalize'

// NOT (ClinicScope ile ilgili): bu dosyadaki sorgular apps/web/src/lib/authz.ts
// içindeki ClinicScope ile SARILMAZ — o mekanizma "danışan (client/patient)
// verisine dokunan sorgular clinicId'siz yazılamasın" kuralını zorlamak için
// var (bkz. clients.ts, Prompt 4.1). Buradaki sorgular ise tam olarak tenancy'nin
// KENDİSİNİ (klinik kaydı, üyelik) yönetiyor:
//  - Onboarding sırasında henüz bir ClinicScope üretilemez (requireClinic()
//    başarısız olur — bkz. authz.ts, "/kurulum akışı" notu), bu yüzden userId
//    bazlı çalışırlar.
//  - Klinik seçici (üst bar) de kullanıcının KENDİ üyeliklerini listeler,
//    tek bir kliniğe scope'lanmış bir sorgu değildir.
// Bu iki grup (tenancy yönetimi vs. danışan verisi) kasıtlı olarak farklı
// güvenlik modellerine sahip.

export interface ClinicInfoInput {
  name: string
  phone?: string | null
  address?: string | null
}

export interface ClinicBrandingInput {
  logoUrl?: string | null
  primaryColor?: string | null
}

export interface ClinicMembership {
  clinicId: string
  role: ClinicMemberRole
  clinicName: string
  clinicSlug: string
  logoUrl: string | null
}

// Kısa, benzersiz bir slug üretir (ör. "beslenme-klinigi-a1b2c3"). Çakışma
// ihtimaline karşı DB'ye gidip yeniden denemek yerine cuid2 tabanlı kısa bir
// rastgele son ek ekliyoruz — pratikte çakışma olasılığı ihmal edilebilir
// düzeyde ve bu, ekstra bir round-trip'ten kaçınıyor.
function slugify(name: string): string {
  const base = normalizeSearchText(name).replace(/\s+/g, '-').replace(/-+$/, '').slice(0, 40) || 'klinik'
  return `${base}-${createId().slice(0, 6)}`
}

// Onboarding sihirbazı yarım kalmışsa devam edebilmek için: kullanıcının
// TAMAMLANMAMIŞ (onboardingCompletedAt IS NULL) en güncel klinik taslağı.
// bkz. schema/tenancy.ts — clinics tablosunun üstündeki tasarım notu.
export async function getDraftClinicForUser(db: Database, userId: string) {
  const [draft] = await db
    .select()
    .from(clinics)
    .where(and(eq(clinics.createdBy, userId), isNull(clinics.onboardingCompletedAt)))
    .orderBy(desc(clinics.createdAt))
    .limit(1)
  return draft ?? null
}

export async function getClinicById(db: Database, clinicId: string) {
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1)
  return clinic ?? null
}

// Onboarding adım 1: taslak klinik satırını oluşturur. trialEndsAt burada
// (klinik "doğduğu" anda) 14 günlük deneme süresiyle set ediliyor.
export async function createDraftClinic(db: Database, userId: string, input: ClinicInfoInput) {
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: input.name,
      slug: slugify(input.name),
      phone: input.phone ?? null,
      address: input.address ?? null,
      createdBy: userId,
      onboardingStep: 2,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    })
    .returning()
  if (!clinic) throw new Error('Klinik oluşturulamadı.')
  return clinic
}

export async function updateClinicInfo(db: Database, clinicId: string, input: ClinicInfoInput) {
  const [clinic] = await db
    .update(clinics)
    .set({
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
    })
    .where(eq(clinics.id, clinicId))
    .returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}

export async function updateClinicBranding(db: Database, clinicId: string, input: ClinicBrandingInput) {
  const [clinic] = await db
    .update(clinics)
    .set({
      logoUrl: input.logoUrl ?? null,
      primaryColor: input.primaryColor ?? null,
      onboardingStep: 3,
    })
    .where(eq(clinics.id, clinicId))
    .returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}

// Onboarding'in son adımı: taslağı tamamlanmış say. clinic_members satırı
// (owner) ve session.activeClinicId güncellemesi (setActiveClinic) BİLEREK
// bu fonksiyonun DIŞINDA, çağıran server action tarafında yapılır — bu
// dosya session/auth kavramlarından bağımsız kalsın diye (bkz. apps/web
// src/app/kurulum/actions.ts).
export async function completeClinicOnboarding(db: Database, clinicId: string) {
  const [clinic] = await db
    .update(clinics)
    .set({ onboardingStep: 4, onboardingCompletedAt: new Date() })
    .where(eq(clinics.id, clinicId))
    .returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}

// Onboarding'i başlatan kullanıcıyı kliniğin sahibi (owner) olarak ekler.
// onConflictDoNothing: aynı kullanıcı için server action iki kez tetiklenirse
// (ör. çift tıklama) ikinci çağrı sessizce hiçbir şey yapmaz.
export async function addClinicOwner(db: Database, clinicId: string, userId: string) {
  const [member] = await db
    .insert(clinicMembers)
    .values({ clinicId, userId, role: 'owner' })
    .onConflictDoNothing({ target: [clinicMembers.clinicId, clinicMembers.userId] })
    .returning()
  return member ?? null
}

// Üst bar klinik seçici için: kullanıcının üye olduğu (tamamlanmış) tüm klinikler.
export async function listClinicMembershipsForUser(db: Database, userId: string): Promise<ClinicMembership[]> {
  return db
    .select({
      clinicId: clinicMembers.clinicId,
      role: clinicMembers.role,
      clinicName: clinics.name,
      clinicSlug: clinics.slug,
      logoUrl: clinics.logoUrl,
    })
    .from(clinicMembers)
    .innerJoin(clinics, eq(clinics.id, clinicMembers.clinicId))
    .where(eq(clinicMembers.userId, userId))
    .orderBy(clinics.name)
}

// Veri saklama süresi ayarı — /ayarlar/veri-guvenligi sayfası (bkz. GitHub
// issue #12 / Prompt 3.3). clinics.dataRetentionDays üzerinde basit bir alan
// güncellemesi; ayrı bir "settings" tablosu açmaya şimdilik gerek görülmedi
// (tek bir sayısal ayar için orantısız olurdu — bkz. schema/tenancy.ts notu).
export async function updateClinicDataRetention(db: Database, clinicId: string, dataRetentionDays: number) {
  const [clinic] = await db
    .update(clinics)
    .set({ dataRetentionDays })
    .where(eq(clinics.id, clinicId))
    .returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}

// GitHub issue #36 / Prompt 6.2, GÖREV 2 — "Klinik ayarlarında mesaj şablonu
// özelleştirilebilsin". updateClinicDataRetention ile AYNI desen — tek alanlı
// güncelleme, ayrı bir "klinik ayarları" tablosu yok (bkz. schema/tenancy.ts
// whatsappMessageTemplate üstündeki not). null geçilerek varsayılana
// (DEFAULT_WHATSAPP_TEMPLATE) dönülebilir.
export async function updateClinicWhatsappTemplate(
  db: Database,
  clinicId: string,
  whatsappMessageTemplate: string | null,
) {
  const [clinic] = await db
    .update(clinics)
    .set({ whatsappMessageTemplate })
    .where(eq(clinics.id, clinicId))
    .returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}

// GitHub issue #41 / Prompt 7.3, GÖREV 3 — "Klinik ayarlarında mesaj şablonu
// özelleştirilebilsin" (SMS için, updateClinicWhatsappTemplate ile AYNI desen).
export async function updateClinicSmsTemplate(db: Database, clinicId: string, smsReminderTemplate: string | null) {
  const [clinic] = await db
    .update(clinics)
    .set({ smsReminderTemplate })
    .where(eq(clinics.id, clinicId))
    .returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}

// GitHub issue #41 / Prompt 7.3, GÖREV 1 — abonelik durumu değiştiğinde
// (plan seçimi, iptal) clinics.subscriptionStatus'un (schema/tenancy.ts,
// GitHub #10'dan beri var olan TEK-KAYNAK alan) senkron kalması için. Sadece
// bu alanı günceller — subscriptions/subscription_events satırlarının
// kendisi apps/web/src/app/(app)/ayarlar/abonelik/actions.ts tarafından AYRI
// ayrı yazılır (bkz. o dosya, ikisi tek bir transaction'da BİRLİKTE çağrılır).
export async function updateClinicSubscriptionStatus(
  db: Database,
  clinicId: string,
  subscriptionStatus: SubscriptionStatus,
) {
  const [clinic] = await db
    .update(clinics)
    .set({ subscriptionStatus })
    .where(eq(clinics.id, clinicId))
    .returning()
  if (!clinic) throw new Error('Klinik bulunamadı.')
  return clinic
}

// Klinik değiştirme (setActiveClinic) öncesi, kullanıcının hedef klinikte
// gerçekten üye olduğunu doğrulamak için.
export async function getClinicMembership(db: Database, clinicId: string, userId: string) {
  const [row] = await db
    .select({ role: clinicMembers.role })
    .from(clinicMembers)
    .where(and(eq(clinicMembers.clinicId, clinicId), eq(clinicMembers.userId, userId)))
    .limit(1)
  return row ?? null
}

export interface ClinicDietitianOption {
  id: string
  name: string
}

// Danışan atama ("atanan diyetisyen") filtresi/formu için (GitHub issue #17
// / Prompt 4.1, GÖREV 2 + GÖREV 4): bu kliniğe kayıtlı, danışan atanabilecek
// üyeler. 'assistant' rolü BİLEREK listeye dahil değil — asistanlar günlük
// işleri (randevu, kayıt) yürütür ama bir danışanın "atanan diyetisyeni"
// olamaz; 'owner' dahil çünkü küçük kliniklerde klinik sahibi genelde aynı
// zamanda pratisyen diyetisyendir. Bu, packages/db/src/queries/clients.ts
// assignDietitianToClients'ın DOĞRUDAN doğrulamadığı dietitianId'nin geçerli
// bir seçenek olduğunu, çağıran server action'ın (apps/web/src/app/(app)/
// danisanlar/actions.ts) karşılaştırdığı liste.
export async function listClinicDietitians(db: Database, clinicId: string): Promise<ClinicDietitianOption[]> {
  return db
    .select({ id: users.id, name: users.name })
    .from(clinicMembers)
    .innerJoin(users, eq(users.id, clinicMembers.userId))
    .where(and(eq(clinicMembers.clinicId, clinicId), inArray(clinicMembers.role, ['owner', 'dietitian'])))
    .orderBy(users.name)
}

// GitHub issue #35 / Prompt 6.1 — PDF başlığındaki "diyetisyen adı" için.
// diet_plans.createdBy'nin (planı OLUŞTURAN kullanıcı — mutlaka bir
// dietitian rolünde olması ŞART DEĞİL, ör. bir 'assistant' da plan girebilir,
// bkz. schema/plans.ts) adını çözer. clinicId'ye göre SCOPE EDİLMEZ — users
// tablosu klinik bağımsız (bkz. clinic_members ayrı tablo); çağıran taraf
// zaten clinicId ile filtrelenmiş bir diet_plans satırından gelen createdBy
// id'sini veriyor, bu yüzden ekstra bir klinik-üyeliği kontrolüne gerek yok.
export async function getUserNameById(db: Database, userId: string): Promise<string | null> {
  const [row] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1)
  return row?.name ?? null
}

// GitHub issue #41 / Prompt 7.3, GÖREV 2 — kullanım limitleri ("kullanıcı
// sayısı") için. countActiveClientsForClinic (queries/clients.ts) ile AYNI
// gerekçe: sadece SAYIYI okur, uyarı üretimi apps/web/src/lib/subscription/
// limits.ts'te.
export async function countClinicMembers(db: Database, clinicId: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(clinicMembers).where(eq(clinicMembers.clinicId, clinicId))
  return row?.total ?? 0
}
