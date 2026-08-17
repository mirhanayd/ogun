// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "örnek plan oluştur" boş
// durumlarının kullandığı, GERÇEKÇİ tek günlük örnek menü. Bu SEED/demo.ts'in
// (GitHub issue #45) 10-planlık demo verisinde kullandığı MEAL_TEMPLATES ile
// AYNI içerik — buraya taşındı ki demo.ts VE gerçek kullanıcının onboarding
// akışı (packages/db/src/queries/plans.ts createSampleClientAndPlan) aynı
// öğün/kalem metnini TEKRAR YAZMASIN (bkz. bu issue'nun görev tanımı: "demo
// seed'in plan-generation logic'ini reuse et, ama demo seed'i doğrudan
// göstereme çünkü o bir bütün sahte klinik/danışan listesi oluşturuyor" —
// çözüm: sadece MENÜ içeriğini paylaş, klinik/danışan/randevu üretme
// mantığının geri kalanı demo.ts'te KALIYOR, gerçek kullanıcı akışı ise
// packages/db/src/queries/plans.ts'te SADECE tek bir danışan + tek bir plan
// oluşturuyor).
export interface SamplePlanMealTemplate {
  mealType: 'kahvaltı' | 'ara1' | 'öğle' | 'ara2' | 'akşam'
  name: string
  time: string
  items: string[]
}

export const SAMPLE_PLAN_MEAL_TEMPLATES: SamplePlanMealTemplate[] = [
  {
    mealType: 'kahvaltı',
    name: 'Kahvaltı',
    time: '08:00',
    items: ['2 adet haşlanmış yumurta', '1 dilim tam buğday ekmeği', '1 kase yoğurt', 'Domates, salatalık, yeşillik'],
  },
  { mealType: 'ara1', name: 'Ara Öğün', time: '10:30', items: ['1 orta boy elma', '5 adet badem'] },
  {
    mealType: 'öğle',
    name: 'Öğle Yemeği',
    time: '13:00',
    items: ['1 kase mercimek çorbası', '150 g ızgara tavuk göğsü', '2 yemek kaşığı bulgur pilavı', 'Mevsim salatası'],
  },
  { mealType: 'ara2', name: 'Ara Öğün', time: '16:00', items: ['1 kase süzme yoğurt', '1 tatlı kaşığı bal'] },
  {
    mealType: 'akşam',
    name: 'Akşam Yemeği',
    time: '19:30',
    items: ['150 g fırında somon', 'Buharda sebze (brokoli, havuç)', '1 kase yoğurt'],
  },
]

export const SAMPLE_PLAN_TARGET_KCAL = 1800
export const SAMPLE_PLAN_TARGET_MACROS = { proteinPct: 25, carbPct: 45, fatPct: 30 }
export const SAMPLE_PLAN_GENERAL_INSTRUCTIONS =
  'Günde en az 2 litre su tüketilmeli. Öğün atlanmamalı. (Bu bir örnek plandır — düzenleyebilir veya silebilirsiniz.)'
