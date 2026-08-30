import { CheckCircle2, Eye, Send } from 'lucide-react'
import { calculateDailyEnergyRequirement, type ActivityLevel } from '@ogun/nutrition-core'
import type { PlanShareStatus } from '@ogun/db/queries'
import { Badge } from '@/components/ui/badge'
import { ClientPlansView } from '@/screens/client-plans-view'
import { viewClientRecord } from '@/lib/data-subject-rights'
import { calculateAge } from '@/lib/client-age'
import { getClientHealthRecord } from '../anamnez/queries'
import { getClientLatestMeasurement } from '../measurements/queries'
import { listClientPlans, getClientPlanShareStatuses } from './queries'
import { NewPlanButton } from './new-plan-button'
import { GoalSkeletonButton } from './goal-skeleton-button'
import { CopyPlanButton } from './copy-plan-button'
import { CreateSamplePlanForClientButton } from './create-sample-plan-for-client-button'

// GitHub issue #36 / Prompt 6.2, GÖREV 4 — "Plan listesinde küçük gösterge:
// gönderildi / görüntülendi / görüntülenmedi". derivePlanShareStatus'ün
// (queries/plan-shares.ts) 'not_shared' durumu burada HİÇ rozet
// GÖSTERMEMEYİ karşılıyor — bir plan hiç paylaşılmadıysa listede gereksiz
// bir "gönderilmedi" gürültüsü yaratmak yerine sessiz kalması tercih edildi
// (roadmap'in üç durumlu göstergesi "sent/viewed/not-viewed" — 'not_shared'
// bu üçlünün DIŞINDA bir dördüncü, daha sessiz durum).
const SHARE_STATUS_BADGE: Record<Exclude<PlanShareStatus, 'not_shared'>, { label: string; icon: typeof Send }> = {
  // "gönderildi" + "görüntülenmedi" AYNI durumun iki yüzü (roadmap metninin
  // üç sözcüğü — gönderildi/görüntülendi/görüntülenmedi — pratikte İKİ
  // durum ifade ediyor: "gönderildi ama henüz görüntülenmedi" ve
  // "görüntülendi", bkz. derivePlanShareStatus notu).
  sent: { label: 'Gönderildi, görüntülenmedi', icon: Eye },
  viewed: { label: 'Görüntülendi', icon: CheckCircle2 },
}

function ShareStatusBadge({ status }: { status: PlanShareStatus }) {
  if (status === 'not_shared') return null
  const { label, icon: Icon } = SHARE_STATUS_BADGE[status]
  return (
    <Badge variant={status === 'viewed' ? 'default' : 'secondary'} className="gap-1 text-[0.65rem]">
      <Icon className="size-3" />
      {label}
    </Badge>
  )
}

// GÖREV 4 — "hedeften plan iskeleti" sihirbazının varsayılan hedef kalori
// önerisini hesaplar. TEE, danışanın YAŞ/CİNSİYET/KİLO/BOY/AKTİVİTE
// bilgilerinin HEPSİ mevcutsa hesaplanır — eksikse null döner ve sihirbaz
// diyetisyenden manuel giriş ister (bkz. goal-skeleton-dialog.tsx).
// nutrition-core'un calculateDailyEnergyRequirement'ı DOĞRUDAN kullanılır,
// TEE mantığı BURADA tekrar YAZILMAZ (görev talimatı: "reuse nutrition-core's
// requirements.ts, don't reimplement").
async function calculateDefaultTargetKcal(clientId: string): Promise<number | null> {
  const [client, measurement, health] = await Promise.all([
    viewClientRecord(clientId),
    getClientLatestMeasurement(clientId),
    getClientHealthRecord(clientId),
  ])
  if (!client || !client.sex) return null
  const age = calculateAge(client.birthDate)
  const weightKg = measurement?.weightKg !== null && measurement?.weightKg !== undefined
    ? Number(measurement.weightKg)
    : null
  const heightCm = measurement?.heightCm !== null && measurement?.heightCm !== undefined
    ? Number(measurement.heightCm)
    : null
  const activityLevel = health?.activityLevel ?? null
  if (age === null || weightKg === null || heightCm === null || !activityLevel) return null

  return Math.round(
    calculateDailyEnergyRequirement({
      sex: client.sex,
      age,
      weightKg,
      heightCm,
      activityLevel: activityLevel as ActivityLevel,
    }),
  )
}

// "Planlar" sekmesinin gerçek içeriği (GitHub issue #25 / Prompt 5.3) —
// danisanlar/[id]/page.tsx'teki EmptyState stub'ının (bkz. o dosyanın
// "planlar" TabsContent'i) yerini alır. Gerçek editör
// /danisanlar/[id]/planlar/[planId] rotasında (bkz. o klasördeki page.tsx).
//
// GitHub issue #27 / Prompt 5.5 GÜNCELLEMESİ — GÖREV 2 & 4: "Bu planı
// kopyala ve düzenle" (her satırda birinci sınıf bir eylem, Link'in İÇİNDE
// gizli DEĞİL) ve "Hedeften oluştur" sihirbazı buraya eklendi.
export async function PlanlarTab({ clientId }: { clientId: string }) {
  const [plans, defaultTargetKcal] = await Promise.all([
    listClientPlans(clientId),
    calculateDefaultTargetKcal(clientId),
  ])
  // GitHub issue #36 / Prompt 6.2, GÖREV 4 — plan listesi zaten çekildikten
  // SONRA, sadece o planların id'leriyle toplu bir durum sorgusu (N+1
  // ÖNLEMEK için, bkz. getShareStatusesForPlans dosya başı notu).
  const shareStatuses = await getClientPlanShareStatuses(plans.map((p) => p.id))

  return <ClientPlansView
    clientId={clientId}
    plans={plans.map((plan) => ({ id: plan.id, name: plan.name, targetKcal: plan.targetKcal, status: plan.status, shareStatus: <ShareStatusBadge status={shareStatuses.get(plan.id) ?? 'not_shared'} /> }))}
    actions={<>
          <GoalSkeletonButton clientId={clientId} defaultTargetKcal={defaultTargetKcal} />
          <NewPlanButton clientId={clientId} />
    </>}
    rowAction={(plan) => <CopyPlanButton clientId={clientId} planId={plan.id} />}
    emptyAction={<div className="pt-1"><CreateSamplePlanForClientButton clientId={clientId} /></div>}
  />
}
