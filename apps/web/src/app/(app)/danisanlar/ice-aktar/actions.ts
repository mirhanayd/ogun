'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { bulkImportClients, confirmClientConsent, type BulkImportClientInput } from '@ogun/db/queries'
import { withAuth, withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { CURRENT_KVKK_CONSENT_VERSION } from '@/lib/validation/client-schemas'
import type { ImportRowValidationOk } from '@/lib/validation/client-import'

// GitHub issue #47 / Prompt 8.3, GÖREV 3 — CSV içe aktarmanın SUNUCU
// tarafı. UI zaten satırları validateImportRow (lib/validation/client-import.ts)
// ile doğrulamış GEÇERLİ satırları gönderir — burada TEKRAR bir Zod şeması
// çalıştırılmıyor (satır başına 400 kez aynı doğrulamayı tekrarlamak yerine,
// istemci VE burası AYNI saf fonksiyonu paylaşıyor); burada sadece BOYUT
// (bir seferde en fazla 1000 satır — sunucuyu aşırı büyük bir tek istekten
// korumak için) ve rıza kuralı zorlanıyor.
const MAX_IMPORT_ROWS = 1000

export interface ImportClientRowInput {
  firstName: string
  lastName: string
  phone: string | null
  birthDate: string | null
  weightHistory: Array<{ measuredAt: string; weightKg: number }>
}

export interface ImportClientsResult {
  success: boolean
  error?: string
  importedCount?: number
}

const importClientsForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'client',
      metadata: ([rows, consentConfirmed]: [ImportClientRowInput[], boolean]) => ({
        operation: 'csv-import',
        rowCount: rows.length,
        consentConfirmed,
      }),
    },
    async (ctx, rows: ImportClientRowInput[], consentConfirmed: boolean) => {
      const consentAt = consentConfirmed ? new Date() : null
      const consentVersion = consentConfirmed ? CURRENT_KVKK_CONSENT_VERSION : null

      const input: BulkImportClientInput[] = rows.map((row) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        birthDate: row.birthDate,
        consentAt,
        consentVersion,
        weightHistory: row.weightHistory.map((entry) => ({
          measuredAt: new Date(entry.measuredAt),
          weightKg: entry.weightKg,
        })),
      }))

      return bulkImportClients(
        db,
        ctx.scope.clinicId,
        ctx.user.id,
        input,
        ctx.role === 'dietitian' ? ctx.user.id : null,
      )
    },
  ),
  ['owner', 'dietitian'],
)

// `validated` istemcinin ZATEN validateImportRow'dan geçirdiği satırlardır
// (bkz. client-import-wizard.tsx) — burada SADECE server action imzasının
// beklediği dar şekle indirgeniyor.
export async function importClientsAction(
  validated: ImportRowValidationOk[],
  consentConfirmed: boolean,
): Promise<ImportClientsResult> {
  if (validated.length === 0) {
    return { success: false, error: 'İçe aktarılacak geçerli satır yok.' }
  }
  if (validated.length > MAX_IMPORT_ROWS) {
    return { success: false, error: `Bir seferde en fazla ${MAX_IMPORT_ROWS} satır içe aktarabilirsiniz.` }
  }

  const rows: ImportClientRowInput[] = validated.map((row) => ({
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    birthDate: row.birthDate,
    weightHistory: row.weightHistory.map((entry) => ({
      measuredAt: entry.measuredAt.toISOString(),
      weightKg: entry.weightKg,
    })),
  }))

  try {
    const inserted = await importClientsForClinic(rows, consentConfirmed)
    revalidatePath('/danisanlar')
    return { success: true, importedCount: inserted.length }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'İçe aktarma başarısız oldu.' }
  }
}

// Toplu içe aktarımda "rıza bekliyor" bırakılan bir danışan için rızanın
// sonradan (ör. danışan kliniğe geldiğinde kağıt formu imzaladığında)
// tamamlanması — bkz. packages/db/src/queries/clients.ts confirmClientConsent
// dosya başı notu.
const confirmClientConsentForClinic = withClientAuth(
  withAudit(
    { action: 'update', entityType: 'client', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) =>
      confirmClientConsent(db, ctx.scope.clinicId, clientId, CURRENT_KVKK_CONSENT_VERSION),
  ),
)

export async function confirmClientConsentAction(clientId: string): Promise<ImportClientsResult> {
  const client = await confirmClientConsentForClinic(clientId)
  if (!client) {
    return { success: false, error: 'Danışan bulunamadı.' }
  }
  revalidatePath(`/danisanlar/${clientId}`)
  return { success: true }
}
