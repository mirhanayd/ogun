import 'server-only'
import { db } from '@ogun/db'
import {
  countActiveClientsForClinic,
  countClinicMembers,
  getClinicById,
  getSubscriptionForClinic,
  listSubscriptionEventsForClinic,
} from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { getSmsUsageThisPeriod } from '@/lib/sms/reminder-runner'
import { computeUsageWarnings } from '@/lib/subscription/limits'
import { getPlanLimits } from '@/lib/subscription/plans'

// /ayarlar/abonelik okumaları — finans/queries.ts (GitHub #40) ile AYNI
// desen: server action DEĞİL, withAuth(withAudit(...)) ile sarılmış normal
// sunucu fonksiyonları. Faturalama/abonelik bilgisi owner-only DEĞİL burada
// (bkz. nav-items.ts — Ayarlar zaten owner+dietitian görebilir) ama plan
// DEĞİŞTİRME/İPTAL action'ları (actions.ts) owner-only kalır — "görme" ile
// "değiştirme" farklı yetki seviyeleri (finans sayfasının owner-only
// KISITINDAN FARKLI: abonelik durumunu bir dietitian da GÖREBİLMELİ, ör.
// "deneme ne zaman bitiyor" bilgisi günlük kullanımı etkiler).
export const getSubscriptionOverview = withAuth(
  withAudit({ action: 'read', entityType: 'subscription' }, async (ctx) => {
    const clinicId = ctx.scope.clinicId
    const [clinic, subscription, events, clientCount, userCount] = await Promise.all([
      getClinicById(db, clinicId),
      getSubscriptionForClinic(db, clinicId),
      listSubscriptionEventsForClinic(db, clinicId),
      countActiveClientsForClinic(db, clinicId),
      countClinicMembers(db, clinicId),
    ])
    if (!clinic) throw new Error('Klinik bulunamadı.')

    const isTrialing = clinic.subscriptionStatus === 'trialing'
    const smsSentThisPeriod = await getSmsUsageThisPeriod(clinicId, subscription?.currentPeriodStart ?? null)
    const limits = getPlanLimits(subscription?.planCode ?? null, isTrialing)
    const warnings = computeUsageWarnings({ clientCount, userCount, smsSentThisPeriod }, limits)

    return { clinic, subscription, events, limits, warnings, usage: { clientCount, userCount, smsSentThisPeriod } }
  }),
)
