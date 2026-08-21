'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  archiveClients,
  assignDietitianToClients,
  createClient,
  getClientById,
  listClinicDietitians,
  updateClientGeneralInfo,
} from '@ogun/db/queries'
import { withAuth, withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  ClientConsentIncompleteError,
  SEX_NOT_SPECIFIED,
  assertClientConsentComplete,
  clientGeneralInfoSchema,
  newClientSchema,
  CURRENT_KVKK_CONSENT_VERSION,
  type ClientGeneralInfoFormValues,
  type NewClientFormValues,
} from '@/lib/validation/client-schemas'

// GitHub issue #17 / Prompt 4.1 — danışan kaydı mutasyonları. Ortak dönüş tipi
// app/kurulum/actions.ts'teki ActionResult örüntüsüyle aynı: hata durumunda
// fırlatmak yerine bir sonuç nesnesi döndürüyoruz, form bileşenleri bunu
// doğrudan formError state'ine yazabiliyor.
export interface ClientActionResult {
  success: boolean
  error?: string
}

function firstZodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Geçersiz veri gönderildi.'
}

// --- Yeni danışan (GÖREV 3) -------------------------------------------------

const createClientForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'client',
      entityId: (_args: [NewClientFormValues], result: { id: string } | undefined) => result?.id ?? null,
    },
    async (ctx, input: NewClientFormValues) => {
      // Form checkbox'ları zaten ZORUNLU (bkz. newClientSchema .refine()) —
      // ama istemci tarafı doğrulaması atlatılabilir olduğu için GERÇEK
      // invaryant burada, sunucu tarafında da uygulanır (bkz. GitHub issue
      // #12 / Prompt 3.3 GÖREV 3 kuralı). assertClientConsentComplete bir
      // TS assertion fonksiyonu olduğu için bundan sonra consent.kvkkConsentAt
      // / explicitConsentAt artık `Date | null` değil `Date` olarak daralır.
      const consent = {
        kvkkConsentAt: input.kvkkConsentChecked ? new Date() : null,
        explicitConsentAt: input.explicitConsentChecked ? new Date() : null,
      }
      assertClientConsentComplete(consent)

      return createClient(db, ctx.scope.clinicId, {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone || null,
        birthDate: input.birthDate || null,
        sex: input.sex === SEX_NOT_SPECIFIED ? null : input.sex,
        kvkkConsentAt: consent.kvkkConsentAt,
        kvkkConsentVersion: CURRENT_KVKK_CONSENT_VERSION,
        explicitConsentAt: consent.explicitConsentAt,
        assignedDietitianId: ctx.role === 'dietitian' ? ctx.user.id : null,
      })
    },
  ),
)

export async function createClientAction(
  input: NewClientFormValues,
): Promise<ClientActionResult & { clientId?: string }> {
  const parsed = newClientSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  try {
    const client = await createClientForClinic(parsed.data)
    revalidatePath('/danisanlar')
    return { success: true, clientId: client.id }
  } catch (error) {
    if (error instanceof ClientConsentIncompleteError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}

// --- "Genel" sekmesi düzenleme (GÖREV 4) ------------------------------------

const updateClientGeneralInfoForClinic = withClientAuth(
  withAudit(
    { action: 'update', entityType: 'client', entityId: ([clientId]: [string, ClientGeneralInfoFormValues]) => clientId },
    async (ctx, clientId: string, input: ClientGeneralInfoFormValues) => {
      // GitHub issue #41 / Prompt 7.3, GÖREV 3 — smsConsentChecked sadece bir
      // AÇIK/KAPALI anahtarı; rızanın VERİLDİĞİ anı (smsConsentAt) KORUMAK
      // için önce mevcut satırı okuyoruz: checkbox zaten işaretliyken tekrar
      // kaydetmek, rıza tarihini "şimdi"ye SIÇRATMAMALI (bkz.
      // kvkkConsentAt'ın recordClientConsent'te AYNI şekilde bir kere
      // yazılıp bir daha DOKUNULMAMASI ile aynı ilke — rıza ANI hukuken
      // önemli bir kayıt).
      const existing = await getClientById(db, ctx.scope.clinicId, clientId)
      const smsConsentAt = input.smsConsentChecked ? (existing?.smsConsentAt ?? new Date()) : null

      return updateClientGeneralInfo(db, ctx.scope.clinicId, clientId, {
        firstName: input.firstName,
        lastName: input.lastName,
        birthDate: input.birthDate || null,
        sex: input.sex === SEX_NOT_SPECIFIED ? null : input.sex,
        phone: input.phone || null,
        email: input.email || null,
        occupation: input.occupation || null,
        referralSource: input.referralSource || null,
        notes: input.notes || null,
        status: input.status,
        smsConsentAt,
      })
    },
  ),
)

export async function updateClientGeneralInfoAction(
  clientId: string,
  input: ClientGeneralInfoFormValues,
): Promise<ClientActionResult> {
  const parsed = clientGeneralInfoSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: firstZodMessage(parsed.error) }
  }

  const client = await updateClientGeneralInfoForClinic(clientId, parsed.data)
  if (!client) {
    return { success: false, error: 'Danışan bulunamadı.' }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  revalidatePath('/danisanlar')
  return { success: true }
}

// --- Toplu işlemler (GÖREV 2) -----------------------------------------------
// Sadece owner/dietitian — deleteClient (data-subject-rights.ts) ile aynı rol
// kısıtı: toplu arşivleme/atama, tek tek danışan kayıtlarını değiştiren
// GÜNLÜK bir işlem değil, klinik yönetimine daha yakın bir eylem.

const archiveClientsForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'client',
      metadata: ([clientIds]: [string[]]) => ({ operation: 'bulk-archive', clientIds }),
    },
    async (ctx, clientIds: string[]) => archiveClients(db, ctx.scope.clinicId, clientIds),
  ),
  ['owner'],
)

export async function archiveClientsAction(clientIds: string[]): Promise<ClientActionResult> {
  if (clientIds.length === 0) {
    return { success: false, error: 'Arşivlemek için en az bir danışan seçmelisiniz.' }
  }
  await archiveClientsForClinic(clientIds)
  revalidatePath('/danisanlar')
  return { success: true }
}

const assignDietitianForClinic = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'client',
      metadata: ([clientIds, dietitianId]: [string[], string]) => ({
        operation: 'bulk-assign-dietitian',
        clientIds,
        dietitianId,
      }),
    },
    async (ctx, clientIds: string[], dietitianId: string) => {
      // dietitianId'nin GERÇEKTEN bu klinikte üye olduğunu doğrula — bkz.
      // schema/clients.ts assignedDietitianId üstündeki not: bu FK/CHECK
      // seviyesinde zorlanmıyor, çağıran taraf (burası) doğrular.
      const options = await listClinicDietitians(db, ctx.scope.clinicId)
      if (!options.some((option) => option.id === dietitianId)) {
        throw new Error('Seçilen diyetisyen bu klinikte bulunamadı.')
      }
      return assignDietitianToClients(db, ctx.scope.clinicId, clientIds, dietitianId)
    },
  ),
  ['owner'],
)

export async function assignDietitianAction(clientIds: string[], dietitianId: string): Promise<ClientActionResult> {
  if (clientIds.length === 0) {
    return { success: false, error: 'Diyetisyen atamak için en az bir danışan seçmelisiniz.' }
  }
  try {
    await assignDietitianForClinic(clientIds, dietitianId)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Atama başarısız oldu.' }
  }
  revalidatePath('/danisanlar')
  return { success: true }
}
