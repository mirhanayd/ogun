import 'server-only'
import { db } from '@ogun/db'
import {
  getClientClinicalSelections,
  getClientHealth,
  withoutCatalogLabels,
} from '@ogun/db/queries'
import { withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// Anamnez okuması (GitHub issue #19 / Prompt 4.3, GÖREV 1) — measurements/
// queries.ts ile AYNI desen: server action DEĞİL, withAuth(withAudit(...))
// ile sarılmış normal bir sunucu fonksiyonu. Sağlık verisi olduğu için okuma
// da denetlenir (bkz. lib/audit.ts dosya başı notu).
export const getClientHealthRecord = withClientAuth(
  withAudit(
    { action: 'read', entityType: 'client_health', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => {
      const [healthRecord, clinical] = await Promise.all([
        getClientHealth(db, ctx.scope.clinicId, clientId),
        getClientClinicalSelections(db, ctx.scope.clinicId, clientId),
      ])
      const conditionCatalogLabels = clinical.conditions.map((condition) => condition.nameTr)
      const medicationCatalogLabels = clinical.medications.flatMap((medication) => {
        const label = medication.productName ?? medication.substanceName
        return label ? [label] : []
      })

      return {
        ...healthRecord,
        healthRecord,
        legacyConditions: withoutCatalogLabels(healthRecord?.conditions, conditionCatalogLabels),
        legacyMedications: withoutCatalogLabels(healthRecord?.medications, medicationCatalogLabels),
        conditionSelections: clinical.conditions,
        medicationSelections: clinical.medications.filter(
          (medication) => medication.medicationProductId || medication.medicationSubstanceId,
        ),
      }
    },
  ),
)
