import 'server-only'
import { db } from '@ogun/db'
import { listDocumentsForClient } from '@ogun/db/queries'
import type { DocumentCategory } from '@ogun/db/schema'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// Belge listesi okuması (GitHub issue #19 / Prompt 4.3, GÖREV 3) —
// measurements/queries.ts ile AYNI desen. Belgenin İÇERİĞİNİN (presigned
// indirme URL'i) okunması AYRI bir işlem (bkz. actions.ts
// getDocumentDownloadUrlAction) — roadmap'in özellikle vurguladığı "belge
// erişimi loglansın" kuralı gereği, bir belgeyi sadece LİSTELEMEK ile
// GERÇEKTEN AÇIP GÖRÜNTÜLEMEK ayrı denetim kayıtları üretir.
export const listClientDocuments = withAuth(
  withAudit(
    { action: 'read', entityType: 'document', entityId: ([clientId]: [string, DocumentCategory?]) => clientId },
    async (ctx, clientId: string, category?: DocumentCategory) =>
      listDocumentsForClient(db, ctx.scope.clinicId, clientId, { category }),
  ),
)
