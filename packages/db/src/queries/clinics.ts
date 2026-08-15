import { and, desc, eq, isNull } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { clinicMembers, clinics, type ClinicMemberRole } from '../schema'
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
