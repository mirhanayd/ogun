import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { hashPassword } from 'better-auth/crypto'
import {
  accounts,
  appointments,
  clientGoals,
  clientHealth,
  clients,
  clinicMembers,
  clinics,
  clinicWorkingHours,
  dietPlans,
  measurements,
  planDays,
  planItems,
  planMeals,
  users,
  type ActivityLevelValue,
  type AppointmentStatus,
  type AppointmentType,
  type ClientAllergenEntry,
} from '../schema'
import { SAMPLE_PLAN_MEAL_TEMPLATES } from './sample-plan-template'

// GitHub issue #45 / Prompt 8.1, GÖREV 4 — "pnpm db:seed:demo → 1 klinik,
// 2 diyetisyen, 25 gerçekçi danışan, ölçüm geçmişleri, 10 plan, randevular.
// Türkçe gerçekçi isimler ve makul veriler — satış demolarında kullanılacak,
// özenli olsun."
//
// src/seed/index.ts (mevcut `pnpm db:seed`) İLE AYNI çalıştırma deseni
// (DATABASE_URL'den bağlan, postgres.js + drizzle, script sonunda bağlantıyı
// kapat) — o script REFERANS veriyi (nutrients/exchange-groups/data-sources)
// idempotent biçimde (onConflictDoNothing) yazar; BU script ise DEMO
// (tekrarlanabilir olması ÖNEMLİ değil, her çalıştırmada YENİ bir demo
// kliniği + danışanları oluşturur — bir satış demosu öncesi "temiz bir
// klinik" isteniyorsa script'i tekrar çalıştırmak yeterli, slug'lar
// createId() ile üretildiği için çakışma riski yok).
//
// Danışan besin kalemleri BİLEREK plan_items.freeText kullanıyor, foods
// tablosundaki gerçek kayıtlara (foodId) REFERANS VERMİYOR: bu ortamda
// foods tablosu BLS/USDA içe aktarımından geliyor ve nameTr alanı henüz
// Türkçeye çevrilmedi (bkz. packages/etl/src/importers/bls.ts
// needsTranslation notu) — demoyu İngilizce besin adlarıyla göstermek
// "özenli" hedefiyle ÇELİŞİRDİ. freeText, plan editöründe aynen
// görüntülenir ve nutrient hesaplaması yapılamayacağını UYARI olarak
// gösterir (bkz. nutrition-core/src/warnings.ts) — demo amaçlı kabul
// edilebilir bir sınırlama, gerçek kullanımda diyetisyen foods aramasından
// seçer.

const DEMO_PASSWORD = 'OgunDemo2026!'

interface NamePair {
  firstName: string
  lastName: string
  sex: 'male' | 'female'
}

// Gerçekçi, yaygın Türkiye isim/soyisim kombinasyonları — uydurma/karikatür
// isimler DEĞİL (ör. "Ali Veli" gibi placeholder'lar YOK), satış demosunda
// bir diyetisyenin gerçek danışan listesine benzemesi hedeflendi.
const FEMALE_FIRST_NAMES = [
  'Ayşe', 'Fatma', 'Emine', 'Zeynep', 'Elif', 'Hatice', 'Meryem', 'Şerife',
  'Büşra', 'Merve', 'Selin', 'Gizem', 'Ebru', 'Dilek', 'Aslı', 'Pınar',
  'Nur', 'Cansu', 'İrem', 'Sena',
]
const MALE_FIRST_NAMES = [
  'Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Osman',
  'Yusuf', 'Murat', 'Emre', 'Burak', 'Kerem', 'Onur', 'Serkan', 'Tolga',
  'Volkan', 'Caner', 'Barış', 'Kaan',
]
const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk',
  'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara',
  'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Aksoy', 'Erdoğan', 'Güneş', 'Polat',
  'Bulut',
]

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!
}

// Deterministik ama dağılımlı bir sözde-rastgele üretici (mulberry32) —
// Math.random() yerine BİLEREK: her çalıştırmada AYNI "gerçekçi" veri seti
// üretmek yerine hafif çeşitlilik istiyoruz ama seed'in tekrar çalıştırılıp
// karşılaştırılabilir olması (ör. demo öncesi bir prova) için bir tohum
// veriliyor; food-search-benchmark.ts'teki sentetik veri üretimiyle AYNI
// "deterministik sentetik veri" felsefesi.
function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(20260817)

function randomName(sex: 'male' | 'female'): NamePair {
  const firstName = sex === 'female' ? pick(FEMALE_FIRST_NAMES, rng) : pick(MALE_FIRST_NAMES, rng)
  const lastName = pick(LAST_NAMES, rng)
  return { firstName, lastName, sex }
}

function randomPhone(): string {
  const prefixes = ['532', '533', '534', '535', '536', '541', '542', '543', '505', '506']
  const prefix = pick(prefixes, rng)
  const rest = Array.from({ length: 7 }, () => Math.floor(rng() * 10)).join('')
  return `0${prefix} ${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)}`
}

function randomBirthDate(minAge: number, maxAge: number): string {
  const age = minAge + Math.floor(rng() * (maxAge - minAge))
  const year = new Date().getFullYear() - age
  const month = 1 + Math.floor(rng() * 12)
  const day = 1 + Math.floor(rng() * 28)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function daysFromNow(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

const OCCUPATIONS = [
  'Öğretmen', 'Mühendis', 'Hemşire', 'Avukat', 'Muhasebeci', 'Grafik Tasarımcı',
  'Yazılım Geliştirici', 'Emlak Danışmanı', 'Serbest Meslek', 'Ev Hanımı',
  'Öğrenci', 'Eczacı', 'Bankacı', 'Satış Temsilcisi', 'Fizyoterapist',
]
const REFERRAL_SOURCES = ['Instagram', 'Tavsiye/referans', 'Google araması', 'Eski danışan tavsiyesi', 'Web sitesi']
const CONDITIONS_POOL = [
  ['Tip 2 diyabet'], ['Hipotiroidi'], ['Hipertansiyon'], ['PKOS'], ['Reflü'],
  ['Yüksek kolesterol'], ['İnsülin direnci'], ['Çölyak hastalığı'], [],
]
const ALLERGY_POOL: Array<{ label: string; severity: ClientAllergenEntry['severity'] }> = [
  { label: 'yer fıstığı', severity: 'şiddetli' },
  { label: 'laktoz', severity: 'orta' },
  { label: 'gluten', severity: 'orta' },
  { label: 'kabuklu deniz ürünleri', severity: 'şiddetli' },
  { label: 'yumurta', severity: 'hafif' },
]

function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

// bkz. ../client.ts'teki aynı not — düz `tsx` ile çalışan bu script kök
// .env'i kendiliğinden görmez.
try {
  process.loadEnvFile(new URL('../../../../.env', import.meta.url))
} catch {
  // kök .env yoksa sorun değil — DATABASE_URL zaten set olabilir.
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set')
  }

  const client = postgres(databaseUrl)
  const db = drizzle(client)

  console.log('--- Demo verisi oluşturuluyor (GitHub issue #45 / Prompt 8.1, GÖREV 4) ---')

  // --- 1. Diyetisyenler (klinikten ÖNCE) -----------------------------------
  // Sıra BİLİNÇLİ: clinics.createdBy bir kullanıcıya referans veriyor, bu
  // yüzden en az bir kullanıcı klinikten önce var olmalı (bkz. aşağıdaki
  // "Neden createdBy + onboardingCompletedAt=NULL" notu).
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  const dietitianDefs = [
    { email: 'elif.kaya@yesiladimdiyet.com', name: 'Dyt. Elif Kaya', role: 'owner' as const },
    { email: 'burak.demir@yesiladimdiyet.com', name: 'Dyt. Burak Demir', role: 'dietitian' as const },
  ]

  const dietitianIds: string[] = []
  for (const def of dietitianDefs) {
    const [user] = await db
      .insert(users)
      .values({ email: def.email, name: def.name, emailVerified: true })
      .returning()
    if (!user) throw new Error('Kullanıcı oluşturulamadı')
    // Better Auth'un email/password sağlayıcısının beklediği şekil: bkz.
    // apps/web/src/lib/auth.ts emailAndPassword — accountId, credential
    // sağlayıcısında userId ile AYNI (Better Auth'un kendi drizzle
    // adapter'ının credential hesapları için ürettiği desen).
    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      password: passwordHash,
    })
    dietitianIds.push(user.id)
  }
  const ownerUserId = dietitianIds[0]!

  // --- 2. Klinik ------------------------------------------------------------
  // ÖNEMLİ (bkz. apps/web/src/lib/authz.ts requireClinic): bir oturumun
  // activeClinicId'si SADECE onboarding sihirbazının son adımı (veya klinik
  // seçici) tarafından set edilir — düz bir DB satırı yazmak BUNU
  // taklit edemez. Bu yüzden onboardingCompletedAt BİLİNÇLİ OLARAK NULL
  // bırakılıyor VE createdBy=ownerUserId veriliyor: demo hesabıyla giriş
  // yapan biri /kurulum'a düşer ama getDraftClinicForUser bu satırı GERÇEK
  // taslağı olarak bulur (isim/telefon/adres zaten dolu gelir) — "Kurulumu
  // tamamla"ya kadar TEK TIK'la (onboardingStep=3, bkz. app/kurulum/page.tsx
  // initialStep) biter, ondan sonra /panel'e gerçek bir aktif klinikle geçer.
  // Bu bir eksiklik/atlama DEĞİL — Better Auth'un mimarisiyle tutarlı TEK
  // doğru yol.
  const clinicSlug = `yesil-adim-diyet-${Date.now().toString(36)}`
  const [clinic] = await db
    .insert(clinics)
    .values({
      name: 'Yeşil Adım Diyet ve Beslenme Kliniği',
      slug: clinicSlug,
      primaryColor: '#1B7A5A',
      phone: '0212 345 67 89',
      address: 'Bağdat Cd. No:142 Kat:3, Kadıköy / İstanbul',
      taxId: '1234567890',
      subscriptionStatus: 'active',
      createdBy: ownerUserId,
      onboardingStep: 3,
      pdfDefaultDensity: 'spacious',
      pdfDefaultShowCalories: true,
    })
    .returning()
  if (!clinic) throw new Error('Klinik oluşturulamadı')

  for (const [index, def] of dietitianDefs.entries()) {
    await db.insert(clinicMembers).values({
      clinicId: clinic.id,
      userId: dietitianIds[index]!,
      role: def.role,
      joinedAt: daysAgo(180),
    })
  }

  // --- 3. Çalışma saatleri (Pzt-Cuma 09-18, Cmt 10-14, Pazar kapalı) -----
  for (let day = 1; day <= 7; day++) {
    const isSaturday = day === 6
    const isSunday = day === 7
    await db.insert(clinicWorkingHours).values({
      clinicId: clinic.id,
      dayOfWeek: day,
      startTime: isSaturday ? '10:00' : '09:00',
      endTime: isSaturday ? '14:00' : '18:00',
      isOpen: !isSunday,
    })
  }

  // --- 4. 25 danışan -------------------------------------------------------
  const CLIENT_COUNT = 25
  const clientIds: Array<{ id: string; sex: 'male' | 'female'; birthDate: string }> = []

  for (let i = 0; i < CLIENT_COUNT; i++) {
    const sex = rng() < 0.68 ? 'female' : 'male' // klinik danışan profili gerçekçi biçimde kadın ağırlıklı
    const name = randomName(sex)
    const birthDate = randomBirthDate(19, 68)
    const status = rng() < 0.85 ? 'aktif' : 'pasif'
    const assignedDietitianId = dietitianIds[i % dietitianIds.length]!
    const consentAt = daysAgo(150 + Math.floor(rng() * 100))

    const [row] = await db
      .insert(clients)
      .values({
        clinicId: clinic.id,
        firstName: name.firstName,
        lastName: name.lastName,
        birthDate,
        sex: name.sex,
        phone: randomPhone(),
        email: `${normalize(name.firstName)}.${normalize(name.lastName)}${i}@ornek-danisan.com`,
        occupation: pick(OCCUPATIONS, rng),
        referralSource: pick(REFERRAL_SOURCES, rng),
        status,
        assignedDietitianId,
        kvkkConsentAt: consentAt,
        kvkkConsentVersion: '2026-01',
        explicitConsentAt: consentAt,
        marketingConsentAt: rng() < 0.6 ? consentAt : null,
        smsConsentAt: rng() < 0.7 ? consentAt : null,
      })
      .returning()
    if (!row) throw new Error('Danışan oluşturulamadı')
    clientIds.push({ id: row.id, sex: name.sex, birthDate })

    // --- 4a. Anamnez (çoğu danışan için) ---------------------------------
    if (rng() < 0.75) {
      const conditions = pick(CONDITIONS_POOL, rng)
      const hasAllergy = rng() < 0.35
      const allergy = hasAllergy ? pick(ALLERGY_POOL, rng) : null
      const allergies: ClientAllergenEntry[] = allergy
        ? [
            {
              id: `${row.id}-allergy-1`,
              label: allergy.label,
              normalized: normalize(allergy.label),
              severity: allergy.severity,
              note: null,
            },
          ]
        : []
      const activityLevels: ActivityLevelValue[] = ['sedentary', 'light', 'moderate', 'active', 'very_active']
      await db.insert(clientHealth).values({
        clientId: row.id,
        conditions,
        allergies,
        smokingStatus: rng() < 0.15 ? 'Günde 5-10 adet' : 'Kullanmıyor',
        alcoholUse: rng() < 0.2 ? 'Sosyal içici (haftada 1-2 kez)' : 'Kullanmıyor',
        mealsPerDay: 2 + Math.floor(rng() * 3),
        eatingOutFrequency: rng() < 0.4 ? 'Haftada 2-3 kez' : 'Nadiren',
        waterIntakeMl: 1000 + Math.floor(rng() * 1500),
        activityLevel: pick(activityLevels, rng),
        sleepHours: 5 + Math.floor(rng() * 4),
        bowelHabits: 'Düzenli',
      })
    }

    // --- 4b. Ölçüm geçmişi (3-6 ölçüm, son 5 ay, gerçekçi trend) --------
    const measurementCount = 3 + Math.floor(rng() * 4)
    const baseHeight = name.sex === 'female' ? 155 + rng() * 20 : 165 + rng() * 20
    const baseWeight = name.sex === 'female' ? 60 + rng() * 30 : 75 + rng() * 35
    // Danışanların çoğu hafif kilo kaybı trendinde (bir diyet kliniğinin
    // beklenen profili) — haftada ortalama 0.3-0.6 kg, GÜVENLİ aralıkta
    // (roadmap'in "haftada 1 kg'dan hızlı kayıp önerme" güvenlik kuralıyla
    // ÇELİŞMEYEN bir demo verisi olsun diye bilinçli sınırlandı).
    const weeklyTrend = -(0.2 + rng() * 0.4)
    for (let m = measurementCount - 1; m >= 0; m--) {
      const weeksAgo = m * (2 + Math.floor(rng() * 2))
      const weight = Math.max(45, baseWeight + weeklyTrend * weeksAgo + (rng() - 0.5) * 0.8)
      await db.insert(measurements).values({
        clientId: row.id,
        measuredAt: daysAgo(weeksAgo * 7),
        source: rng() < 0.2 ? 'inbody' : 'manuel',
        weightKg: weight.toFixed(2),
        heightCm: baseHeight.toFixed(1),
        waistCm: (70 + rng() * 25).toFixed(1),
        bodyFatPct: (18 + rng() * 15).toFixed(1),
        notes: m === 0 ? 'Danışan planı iyi uyguluyor, enerji seviyesi yüksek.' : null,
        recordedBy: assignedDietitianId,
      })
    }

    // --- 4c. Hedef (yaklaşık %40 danışan için) ---------------------------
    if (rng() < 0.4) {
      await db.insert(clientGoals).values({
        clientId: row.id,
        type: 'kilo',
        targetValue: Math.max(45, baseWeight - 8).toFixed(2),
        targetDate: daysFromNow(90).toISOString().slice(0, 10),
        startValue: baseWeight.toFixed(2),
        startedAt: daysAgo(measurementCount * 14),
      })
    }
  }

  // --- 5. 10 diyet planı ---------------------------------------------------
  // GitHub issue #47 / Prompt 8.3 — bu öğün şablonu artık sample-plan-template.ts'e
  // taşındı (bkz. o dosyanın başındaki not), "örnek plan oluştur" onboarding
  // özelliği AYNI menüyü kullanıyor, burada TEKRARLANMIYOR.
  const MEAL_TEMPLATES = SAMPLE_PLAN_MEAL_TEMPLATES

  const PLAN_STATUSES: Array<'taslak' | 'aktif' | 'arşiv'> = ['aktif', 'aktif', 'aktif', 'aktif', 'aktif', 'aktif', 'taslak', 'taslak', 'arşiv', 'aktif']

  for (let p = 0; p < 10; p++) {
    const targetClient = clientIds[p % clientIds.length]!
    const [plan] = await db
      .insert(dietPlans)
      .values({
        clinicId: clinic.id,
        clientId: targetClient.id,
        name: `${['Kilo Verme', 'Dengeli Beslenme', 'Diyabet Dostu', 'Enerji Artırıcı', 'Sindirim Dostu'][p % 5]} Planı`,
        startDate: daysAgo(7 * (p + 1)),
        targetKcal: 1400 + Math.floor(rng() * 700),
        targetMacros: { proteinPct: 25, carbPct: 45, fatPct: 30 },
        planType: 'günlük',
        status: PLAN_STATUSES[p]!,
        createdBy: dietitianIds[p % dietitianIds.length]!,
        generalInstructions: 'Günde en az 2 litre su tüketilmeli. Öğün atlanmamalı.',
      })
      .returning()
    if (!plan) throw new Error('Plan oluşturulamadı')

    const [day] = await db.insert(planDays).values({ planId: plan.id, dayNumber: 1 }).returning()
    if (!day) throw new Error('Plan günü oluşturulamadı')

    for (const [mealIndex, mealTemplate] of MEAL_TEMPLATES.entries()) {
      const [meal] = await db
        .insert(planMeals)
        .values({
          dayId: day.id,
          mealType: mealTemplate.mealType,
          time: mealTemplate.time,
          name: mealTemplate.name,
          sortOrder: mealIndex,
        })
        .returning()
      if (!meal) throw new Error('Öğün oluşturulamadı')

      for (const [itemIndex, itemText] of mealTemplate.items.entries()) {
        await db.insert(planItems).values({
          mealId: meal.id,
          freeText: itemText,
          amount: '1.00',
          sortOrder: itemIndex,
        })
      }
    }
  }

  // --- 6. Randevular (geçmiş + gelecek, iki diyetisyene dağılmış) ---------
  let appointmentCount = 0
  for (let i = 0; i < clientIds.length; i++) {
    const targetClient = clientIds[i]!
    const dietitianId = dietitianIds[i % dietitianIds.length]!
    // Her danışan için 1-3 randevu: geçmişte tamamlanmış + gelecekte planlı.
    const pastCount = 1 + Math.floor(rng() * 2)
    for (let a = 0; a < pastCount; a++) {
      const daysBack = 7 + a * 14 + Math.floor(rng() * 5)
      const start = daysAgo(daysBack)
      start.setHours(9 + Math.floor(rng() * 8), 0, 0, 0)
      const end = new Date(start.getTime() + 30 * 60_000)
      const statusPool: AppointmentStatus[] = ['geldi', 'geldi', 'geldi', 'gelmedi', 'iptal']
      const typePool: AppointmentType[] = ['kontrol', 'ilk_görüşme', 'ölçüm']
      await db.insert(appointments).values({
        clinicId: clinic.id,
        clientId: targetClient.id,
        dietitianId,
        startsAt: start,
        endsAt: end,
        type: a === 0 ? 'ilk_görüşme' : pick(typePool, rng),
        status: pick(statusPool, rng),
      })
      appointmentCount++
    }
    if (rng() < 0.6) {
      const daysAhead = 1 + Math.floor(rng() * 21)
      const start = daysFromNow(daysAhead)
      start.setHours(9 + Math.floor(rng() * 8), 0, 0, 0)
      const end = new Date(start.getTime() + 30 * 60_000)
      await db.insert(appointments).values({
        clinicId: clinic.id,
        clientId: targetClient.id,
        dietitianId,
        startsAt: start,
        endsAt: end,
        type: 'kontrol',
        status: 'planlandı',
      })
      appointmentCount++
    }
  }

  console.log(
    `Demo verisi oluşturuldu:\n` +
      `  Klinik: ${clinic.name} (slug: ${clinic.slug})\n` +
      `  Diyetisyenler: ${dietitianDefs.map((d) => `${d.name} <${d.email}>`).join(', ')}\n` +
      `  Ortak şifre: ${DEMO_PASSWORD}\n` +
      `  Danışan sayısı: ${clientIds.length}\n` +
      `  Plan sayısı: 10\n` +
      `  Randevu sayısı: ${appointmentCount}\n` +
      `Giriş yapmak için: ${dietitianDefs[0]!.email} / ${DEMO_PASSWORD}`,
  )

  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
