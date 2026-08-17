import { writeFileSync } from 'node:fs'
import path from 'node:path'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { hashPassword } from 'better-auth/crypto'
import { accounts, clientHealth, clients, clinicMembers, clinics, users } from '@ogun/db/schema'

// GitHub issue #45 / Prompt 8.1, GÖREV 3 — E2E fixture verisi. GERÇEK bir
// Postgres'e yazar (mock YOK) — apps/web/src/lib/authz.ts'teki ClinicScope
// kuralının GERÇEKTEN uygulandığını (bkz. authorization.spec.ts) sadece
// GERÇEK, farklı clinicId'li iki satırla doğrulayabiliriz; sahte/mock bir
// veri kümesi bu testin ASIL değerini (cross-tenant izolasyonun DB
// seviyesinde de çalıştığını kanıtlamak) taşımaz.
//
// Her çalıştırma YENİ bir clinic/kullanıcı seti üretir (createId() zaten
// tekil) — kimlikler apps/e2e/fixtures/.e2e-credentials.json içine yazılır,
// testler (tests/*.spec.ts) bu dosyayı OKUR. Dosya .gitignore'da (gerçek
// şifre hash'i taşımaz ama e-posta/id içerir, repoya girmemeli).

const DEMO_PASSWORD = 'E2eDemo2026!'

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set — bkz. .env.example, E2E testleri GERÇEK bir Postgres gerektirir.')
  }

  const sql = postgres(databaseUrl)
  const db = drizzle(sql)
  const suffix = Date.now().toString(36)
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  // NOT (bkz. packages/db/src/seed/demo.ts AYNI başlıklı not): activeClinicId
  // SADECE onboarding sihirbazının son adımıyla set edilir — bu yüzden
  // clinics.onboardingCompletedAt BİLİNÇLİ OLARAK NULL bırakılıyor VE
  // createdBy=user.id veriliyor, testler (fixtures/auth.ts
  // loginAndEnsureOnboarded) GERÇEK sihirbazı (önceden dolu bilgilerle,
  // onboardingStep=3 sayesinde TEK tıkla) tamamlayarak /panel'e ulaşıyor.
  async function createClinicWithDietitian(label: 'a' | 'b') {
    const email = `e2e-dietitian-${label}-${suffix}@ogun.test`
    const [user] = await db
      .insert(users)
      .values({ email, name: `E2E Diyetisyen ${label.toUpperCase()}`, emailVerified: true })
      .returning()
    if (!user) throw new Error('E2E kullanıcısı oluşturulamadı')

    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      password: passwordHash,
    })

    const [clinic] = await db
      .insert(clinics)
      .values({
        name: `E2E Klinik ${label.toUpperCase()}`,
        slug: `e2e-clinic-${label}-${suffix}`,
        phone: '0212 000 00 00',
        address: 'Test Adresi',
        createdBy: user.id,
        onboardingStep: 3,
        subscriptionStatus: 'active',
      })
      .returning()
    if (!clinic) throw new Error('E2E kliniği oluşturulamadı')

    await db.insert(clinicMembers).values({
      clinicId: clinic.id,
      userId: user.id,
      role: 'owner',
      joinedAt: new Date(),
    })

    return { clinic, user, email }
  }

  const clinicA = await createClinicWithDietitian('a')
  const clinicB = await createClinicWithDietitian('b')

  // Klinik B'de, klinik A'nın kullanıcısının ASLA erişememesi gereken bir
  // danışan (tests/authorization.spec.ts bunu doğrudan URL ile açmaya
  // çalışır).
  const [clientB] = await db
    .insert(clients)
    .values({
      clinicId: clinicB.clinic.id,
      firstName: 'Gizli',
      lastName: 'DanışanB',
      status: 'aktif',
      assignedDietitianId: clinicB.user.id,
      kvkkConsentAt: new Date(),
      kvkkConsentVersion: '2026-01',
      explicitConsentAt: new Date(),
    })
    .returning()
  if (!clientB) throw new Error('E2E danışanı (klinik B) oluşturulamadı')
  await db.insert(clientHealth).values({
    clientId: clientB.id,
    conditions: ['Tip 2 diyabet'],
    smokingStatus: 'Kullanmıyor',
  })

  const credentials = {
    clinicA: { id: clinicA.clinic.id, name: clinicA.clinic.name, email: clinicA.email, password: DEMO_PASSWORD },
    clinicB: {
      id: clinicB.clinic.id,
      name: clinicB.clinic.name,
      email: clinicB.email,
      password: DEMO_PASSWORD,
      clientId: clientB.id,
    },
  }

  const outPath = path.resolve(__dirname, '.e2e-credentials.json')
  writeFileSync(outPath, JSON.stringify(credentials, null, 2), 'utf-8')
  console.log(`E2E fixture verisi oluşturuldu → ${outPath}`)
  console.log(JSON.stringify(credentials, null, 2))

  await sql.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
