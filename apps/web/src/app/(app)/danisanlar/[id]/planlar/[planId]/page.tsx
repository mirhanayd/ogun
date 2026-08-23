import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getClinicById } from '@ogun/db/queries'
import { addDayDuringRender, addMealAction, getPlanTreeAction } from '@/app/(app)/planlar/actions'
import { getClientHealthRecord } from '@/app/(app)/danisanlar/[id]/anamnez/queries'
import { PLAN_MEAL_TYPE_OPTIONS } from '@/lib/validation/plan-schemas'
import { viewClientRecord } from '@/lib/data-subject-rights'
import { calculateAge } from '@/lib/client-age'
import { requireClinic } from '@/lib/authz'
import { PlanEditor } from './plan-editor'

// GitHub issue #25 / Prompt 5.3 — GÖREV 1: editör rotası
// /danisanlar/[id]/planlar/[planId]. #23'ün bıraktığı boşluk: bir plan
// oluşturulduğunda (createPlanAction) HENÜZ hiçbir gün/öğün YOK — plan
// editörünün "sol: öğün blokları listesi" gösterebilmesi için en az bir gün
// + roadmap'in tanımladığı 6 standart öğün (kahvaltı/ara1/öğle/ara2/akşam/
// gece) gerekiyor. Bu sayfa, plan İLK AÇILDIĞINDA (days.length === 0 ise)
// bunu TEK SEFERLİK, sunucu tarafında bootstrap eder — #23'ün addDay/addMeal
// action'larını ÇAĞIRIR, raw sorguyla bypass ETMEZ.
async function ensurePlanBootstrapped(planId: string, expectedClientId: string) {
  const result = await getPlanTreeAction(planId)
  if (!result.success || !result.data) return null
  // URL'deki danışan-plan eşleşmesini herhangi bir bootstrap YAZIMINDAN önce
  // doğrula. Aksi halde başka bir danışanın boş planı, sayfa sonunda 404 olsa
  // bile bu noktada öğünlerle doldurulabilirdi.
  if (result.data.plan.clientId !== expectedClientId) return null
  if (result.data.days.length > 0) return result.data

  // GitHub issue #45 / Prompt 8.1 — addDayAction DEĞİL, addDayDuringRender:
  // bu fonksiyon (ensurePlanBootstrapped) sayfa RENDER EDİLİRKEN çalışıyor,
  // addDayAction'ın revalidatePath yan etkisi burada Next.js 15'te bir
  // çalışma zamanı hatasına yol açıyordu (bkz. actions.ts'teki
  // addDayDuringRender'ın üstündeki not).
  const dayResult = await addDayDuringRender(planId, { dayNumber: 1 })
  if (!dayResult.success || !dayResult.data) return result.data

  for (const [index, option] of PLAN_MEAL_TYPE_OPTIONS.entries()) {
    await addMealAction(dayResult.data.id, {
      mealType: option.value,
      name: option.label,
      sortOrder: index,
    })
  }

  const refreshed = await getPlanTreeAction(planId)
  return refreshed.success ? (refreshed.data ?? null) : null
}

export default async function PlanEditorPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>
}) {
  const { id, planId } = await params

  // GitHub issue #35 / Prompt 6.1 — PDF üretim diyaloğunun başlangıç
  // değerleri klinik-varsayılanından (clinics.pdfDefaultDensity/
  // pdfDefaultShowCalories, bkz. schema/tenancy.ts) gelir — diyetisyen
  // diyalogda İSTEDİĞİ an override edebilir ama açılış hâli klinik
  // tercihini yansıtır (bkz. GÖREV: "klinik seviyesinde bir varsayılanı
  // OLMALI").
  const { scope, user } = await requireClinic()

  // Önce danışan atama kapsamını doğrula; yetkisiz bir URL hiçbir plan okuma
  // veya bootstrap yan etkisini başlatmasın.
  const client = await viewClientRecord(id)
  if (!client || client.deletedAt) notFound()

  const [tree, health, clinic] = await Promise.all([
    ensurePlanBootstrapped(planId, id),
    // GitHub issue #26 / Prompt 5.4 — canlı besin öğesi panelinin hem
    // referans karşılaştırması (yaş/cinsiyet) hem alerji/intolerans
    // çakışması (GÖREV 3) için danışanın sağlık profiline ihtiyacı var.
    // Kayıt yoksa (anamnez formu hiç doldurulmamışsa) getClientHealthRecord
    // undefined döner — panel bunu "referans yok" olarak ele alır.
    getClientHealthRecord(id),
    getClinicById(db, scope.clinicId),
  ])

  if (!tree) {
    notFound()
  }
  // Bu rota bir DANIŞANIN planı için — şablon (clientId=null) veya başka bir
  // danışana ait bir plan buradan AÇILAMAZ (URL'i elle değiştirerek başka
  // danışanın planına erişim denemesi de burada engellenir).
  if (tree.plan.clientId !== id) {
    notFound()
  }

  return (
    <PlanEditor
      userId={user.id}
      planId={tree.plan.id}
      clientId={id}
      planName={tree.plan.name}
      startDate={tree.plan.startDate}
      endDate={tree.plan.endDate}
      targetKcal={tree.plan.targetKcal}
      outputFormat={tree.plan.outputFormat}
      tree={tree}
      clientSex={client.sex}
      clientAge={calculateAge(client.birthDate)}
      allergies={health?.allergies ?? null}
      intolerances={health?.intolerances ?? null}
      pdfDefaultDensity={clinic?.pdfDefaultDensity ?? 'spacious'}
      pdfDefaultShowCalories={clinic?.pdfDefaultShowCalories ?? true}
      clientName={`${client.firstName} ${client.lastName}`}
      clientPhone={client.phone}
      clientEmail={client.email}
      whatsappTemplate={clinic?.whatsappMessageTemplate ?? null}
    />
  )
}
