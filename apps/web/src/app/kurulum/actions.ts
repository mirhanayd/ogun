'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  addClinicOwner,
  completeClinicOnboarding,
  createDraftClinic,
  getDraftClinicForUser,
  updateClinicBranding,
  updateClinicInfo,
  upsertWorkingHours,
} from '@ogun/db/queries'
import { requireAuth, setActiveClinic } from '@/lib/authz'
import {
  MAX_LOGO_BYTES,
  brandingSchema,
  clinicInfoSchema,
  workingHoursSchema,
  type BrandingFormValues,
  type ClinicInfoFormValues,
  type WorkingHoursFormValues,
} from '@/lib/validation/onboarding-schemas'

// Bu dosyadaki her export bir Next.js server action'dır ('use server' dosya
// seviyesinde). Sihirbaz bileşeni (onboarding-wizard.tsx, 'use client') bu
// fonksiyonları normal async fonksiyonlar gibi çağırır.
//
// Ortak dönüş tipi: başarısızlıkta ayrıntı fırlatmak yerine (try/catch
// zorunlu kılmak) bir sonuç nesnesi döndürüyoruz — form bileşenleri bunu
// doğrudan formError state'ine yazabiliyor, auth sayfalarındaki (giris/kayit)
// örüntüyle tutarlı.
export interface OnboardingActionResult {
  success: boolean
  error?: string
  clinicId?: string
}

// clinicInfoSchema.safeParse hatalarını tek bir Türkçe mesaja indirger.
function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

async function getOrCreateDraftClinic(userId: string, input: ClinicInfoFormValues) {
  const draft = await getDraftClinicForUser(db, userId)
  if (draft) {
    return updateClinicInfo(db, draft.id, {
      name: input.name,
      phone: input.phone || null,
      address: input.address || null,
    })
  }
  return createDraftClinic(db, userId, {
    name: input.name,
    phone: input.phone || null,
    address: input.address || null,
  })
}

// Adım 1: klinik adı, telefon, adres.
export async function saveClinicInfoAction(input: ClinicInfoFormValues): Promise<OnboardingActionResult> {
  const parsed = clinicInfoSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const { user } = await requireAuth()
  const clinic = await getOrCreateDraftClinic(user.id, parsed.data)
  revalidatePath('/kurulum')
  return { success: true, clinicId: clinic.id }
}

// Adım 2: logo (base64 data URI) ve marka rengi.
export async function saveBrandingAction(input: BrandingFormValues): Promise<OnboardingActionResult> {
  const parsed = brandingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }
  if (parsed.data.logoDataUrl && parsed.data.logoDataUrl.length > MAX_LOGO_BYTES * 1.4) {
    // base64 kodlaması ham boyuttan ~%37 daha büyük olduğu için kabaca bir üst sınır.
    return { success: false, error: 'Logo dosyası çok büyük (maksimum 500 KB).' }
  }

  const { user } = await requireAuth()
  const draft = await getDraftClinicForUser(db, user.id)
  if (!draft) {
    return { success: false, error: 'Önce klinik bilgilerini kaydetmelisiniz.' }
  }

  const clinic = await updateClinicBranding(db, draft.id, {
    logoUrl: parsed.data.logoDataUrl || null,
    primaryColor: parsed.data.primaryColor || null,
  })
  revalidatePath('/kurulum')
  return { success: true, clinicId: clinic.id }
}

// Adım 3 (son adım): çalışma saatleri. Başarılı olursa onboarding'i
// tamamlanmış işaretler, kliniğin sahibini (owner) ekler ve aktif oturuma
// bu kliniği bağlar (setActiveClinic) — bundan sonra requireClinic() (ve
// dolayısıyla app/(app) kabuğu) bu kullanıcı için başarılı olur.
//
// NOT: yönlendirme (redirect) burada YAPILMIYOR — Next.js'te redirect() bir
// istisna fırlatarak çalışır ve bunu bir "ActionResult" ile karıştırmak
// (örn. try/catch içine gizlice almak) hataya açık. Bunun yerine bileşen
// (onboarding-wizard.tsx) success:true gördüğünde router.push('/panel') çağırır.
export async function saveWorkingHoursAction(input: WorkingHoursFormValues): Promise<OnboardingActionResult> {
  const parsed = workingHoursSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const { user } = await requireAuth()
  const draft = await getDraftClinicForUser(db, user.id)
  if (!draft) {
    return { success: false, error: 'Önce klinik bilgilerini kaydetmelisiniz.' }
  }

  await upsertWorkingHours(db, draft.id, parsed.data.hours)
  await completeClinicOnboarding(db, draft.id)
  await addClinicOwner(db, draft.id, user.id)
  await setActiveClinic(draft.id, 'owner')

  revalidatePath('/', 'layout')
  return { success: true, clinicId: draft.id }
}
