import { and, desc, eq } from 'drizzle-orm'
import { auditLogs, type AuditAction } from '../schema'
import type { Database } from '../client'

// Bu dosyadaki sorgular apps/web/src/lib/audit.ts withAudit() sarmalayıcısı
// tarafından çağrılır — çağıran taraf (apps/web) clinicId/userId'yi HER ZAMAN
// authz.ts'teki ClinicContext'ten türetir, bu dosya kendi başına bir yetki
// kontrolü yapmaz (bkz. queries/clinics.ts üstündeki benzer not).

export interface AuditLogInput {
  clinicId: string
  // Sistem tarafından tetiklenen kayıtlar için null (bkz. schema/audit.ts).
  userId: string | null
  action: AuditAction
  entityType: string
  entityId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown>
}

export async function insertAuditLog(db: Database, input: AuditLogInput) {
  const [row] = await db
    .insert(auditLogs)
    .values({
      clinicId: input.clinicId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata,
    })
    .returning()
  if (!row) throw new Error('Denetim kaydı oluşturulamadı.')
  return row
}

// /ayarlar/veri-guvenligi sayfası — klinik başına en yeni erişim/işlem logları.
export async function listRecentAuditLogsForClinic(db: Database, clinicId: string, limit = 50) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.clinicId, clinicId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
}

// Belirli bir varlığın (ör. TEK bir danışanın) tüm erişim geçmişi — veri
// sahibi hakları kapsamında dışa aktarmaya dahil edilir (bkz.
// apps/web/src/lib/data-subject-rights.ts exportClientData) ve ileride
// danışan detay sayfasında "erişim geçmişi" göstermek için kullanılabilir.
export async function listAuditLogsForEntity(db: Database, entityType: string, entityId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt))
}
