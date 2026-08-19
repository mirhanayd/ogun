import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'

// GitHub issue #45 / Prompt 8.1, GÖREV 3 — seed-e2e.ts'in yazdığı kimlik
// bilgilerini okuyan ortak yardımcı. `pnpm --filter @ogun/e2e seed`
// çalıştırılmadan testler bu dosyayı bulamaz — BİLİNÇLİ bir hata (mock
// veriye SESSİZCE düşmek yerine net bir "önce seed çalıştır" hatası).
export interface E2eCredentials {
  clinicA: { id: string; name: string; email: string; password: string }
  clinicB: { id: string; name: string; email: string; password: string; clientId: string }
}

export function loadE2eCredentials(): E2eCredentials {
  const filePath = path.resolve(__dirname, '.e2e-credentials.json')
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as E2eCredentials
  } catch {
    throw new Error(
      `E2E fixture verisi bulunamadı (${filePath}). Önce çalıştırın: pnpm --filter @ogun/e2e seed`,
    )
  }
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
}

// GERÇEK BİR HATA NOTU (bu E2E'leri yazarken keşfedildi): shadcn'in
// CardTitle bileşeni (bkz. apps/web/src/components/ui/card.tsx) semantik
// bir `<h1>`-`<h6>` DEĞİL, düz bir `<div>` render ediyor — bu yüzden
// `page.getByRole('heading', { name: ... })` bu başlıklarla HİÇBİR ZAMAN
// eşleşmez (Next.js'in kendi varsayılan 404 sayfasındaki GERÇEK `<h1>/<h2>`
// başlıklarının AKSİNE). Bu proje genelinde CardTitle KULLANAN her ekran
// (giriş formu, onboarding sihirbazı adımları, vb.) için metin tabanlı bir
// seçici (`getByText`) kullanılmalı — `getByRole('heading', ...)` sessizce
// hiç eşleşmez ve `waitFor`'un TÜM timeout süresini (varsayılan/verilen ne
// ise) boşuna bekler.
function cardTitle(page: Page, text: string) {
  return page.locator('[data-slot="card-title"]', { hasText: text })
}

// seed-e2e.ts sadece clinics/users/clinic_members SATIRLARINI doğrudan
// veritabanına yazıyor — GERÇEK bir kullanıcının /kayit akışından geçmiyor.
// Bu yüzden oturumun activeClinicId'si (bkz. apps/web/src/lib/authz.ts
// requireClinic) HENÜZ set edilmemiş olur: Better Auth'ta bu alan SADECE
// onboarding sihirbazının son adımı (setActiveClinic çağrısı) veya klinik
// seçiciyle set edilir, girişin kendisiyle DEĞİL (bkz. auth.ts dosya başı
// notu — "oturuma bağlıdır, kullanıcıya değil"). Bu fonksiyon, GERÇEK
// sihirbaz akışını (klinik bilgisi zaten dolu geldiği için 3 tık) çalıştırarak
// /panel'e ulaşır — bir "atlama"/mock DEĞİL, klinik zaten var olan bir
// kullanıcının GERÇEKTE ilk girişte göreceği akışın ta kendisi.
// GERÇEK ÜRÜN DAVRANIŞI NOTU (bu E2E testlerini yazarken keşfedildi, bkz.
// docs/performance.md bölüm 6'daki clinicScopeBrand notuyla AYNI kategori —
// bu fonksiyonun bir "atlama" değil, gerçek davranışı doğru şekilde
// yönetmesi gerektiği bir bulgu): requireClinic() activeClinicId'yi
// OTURUMDAN okur (bkz. authz.ts), oturum ise HER girişte YENİDEN oluşur —
// yani klinik daha önce TAMAMEN onboard edilmiş olsa bile (onboardingCompletedAt
// dolu), YENİ bir oturumda activeClinicId henüz set edilmemiştir ve kullanıcı
// /kurulum'a düşer. getDraftClinicForUser bu durumda (onboardingCompletedAt
// artık NULL olmadığı için) draft'ı BULAMAZ, sihirbaz BOŞ alanlarla açılır.
// Bu, uygulamanın GERÇEK bugünkü davranışı (bir iyileştirme fırsatı olarak
// not edilebilir ama bu issue'nun kapsamı DIŞINDA) — bu yüzden aşağıdaki
// fonksiyon "alan dolu mu boş mu" varsaymadan, GEREKİRSE dolduruyor.
// Adımlar arasındaki geçiş (her adımın "Devam et"i saveXAction() adlı bir
// server action'ı BEKLİYOR, bkz. clinic-info-step.tsx/branding-step.tsx) her
// zaman anlık DEĞİL — bir sonraki adımın başlığı görünene kadar EXPLICIT
// bekliyoruz (isVisible() ile "anlık" kontrol YERİNE, waitFor ile) ki React
// yeniden render OLMADAN bir sonraki kontrol tetiklenmesin (bu, önceki
// sürümün — sabit sayıda deneme + isVisible() anlık kontrolü — geçiş
// ortasında HER İKİ butonu da "görünmez" bulup adımda TAKILI KALMASININ
// gerçek nedeniydi, bkz. bu fonksiyonun ilk canlı E2E koşusunda yakalandı).
// GitHub issue #61 — ÜRÜN TURU DİYALOĞUNU KAPAT. Bu yardımcı, #47'nin ilk
// giriş turundan (bkz. app/(app)/_components/product-tour.tsx) ÖNCE yazıldı:
// seed-e2e.ts'in oluşturduğu kullanıcıda `productTourCompletedAt` NULL olduğu
// için /panel'e varır varmaz 4 adımlı tur diyaloğu AÇILIYOR ve sayfanın
// tamamını modal overlay ile kaplıyor. critical-flow bu yüzden ilk adımda
// ("KVKK ... okudum" onay kutusu) 240 sn boyunca "subtree intercepts pointer
// events" ile takılıp kalıyordu — plan editörüne HİÇ ULAŞAMIYORDU (bkz.
// docs/performance.md bölüm 7'nin "E2E — kısmen doğrulandı" satırı).
// apps/e2e/scripts/capture-plan-editor.ts (#60) bunu zaten yapıyordu; aynı
// gerçek kullanıcı davranışı ("Turu atla") artık ortak yardımcıda.
async function dismissProductTourIfPresent(page: Page): Promise<void> {
  const skipTour = page.getByRole('button', { name: 'Turu atla' })
  if (await skipTour.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await skipTour.click()
    await skipTour.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  }
}

export async function loginAndEnsureOnboarded(page: Page, email: string, password: string): Promise<void> {
  await login(page, email, password)
  await page.waitForURL(/\/(kurulum|panel)/)

  if (page.url().includes('/panel')) {
    await dismissProductTourIfPresent(page)
    return
  }

  // Sihirbaz, seed-e2e.ts'in yazdığı clinics.onboardingStep'e göre 1., 2.
  // VEYA doğrudan 3. adımdan başlayabilir (bkz. app/kurulum/page.tsx
  // initialStep) — bu yüzden HER adımın kendine özgü başlığını (bkz.
  // clinic-info-step.tsx "Klinik bilgileri", branding-step.tsx "Marka",
  // working-hours-step.tsx "Çalışma saatleri") KOŞULLU olarak bekliyoruz;
  // hangi adımdan başladığımızdan bağımsız çalışır.

  // Adım 1 — Klinik bilgileri (draft bulunamadıysa alan boş gelir, bkz.
  // yukarıdaki "gerçek ürün davranışı" notu — bu durumda dolduruyoruz).
  const clinicInfoHeading = cardTitle(page, 'Klinik bilgileri')
  if (await clinicInfoHeading.isVisible().catch(() => false)) {
    const clinicNameInput = page.getByLabel('Klinik adı')
    const currentValue = await clinicNameInput.inputValue()
    if (!currentValue.trim()) {
      await clinicNameInput.fill('E2E Test Kliniği')
    }
    await page.getByRole('button', { name: 'Devam et' }).click()
  }

  // Adım 2 — Marka (tüm alanlar opsiyonel, doğrudan geç).
  const brandingHeading = cardTitle(page, 'Marka')
  await brandingHeading.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  if (await brandingHeading.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Devam et' }).click()
  }

  // Adım 3 — Çalışma saatleri (varsayılan saatlerle tamamla).
  const workingHoursHeading = cardTitle(page, 'Çalışma saatleri')
  await workingHoursHeading.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  await page.getByRole('button', { name: 'Kurulumu tamamla' }).click()
  await page.waitForURL('**/panel', { timeout: 20_000 })
  await dismissProductTourIfPresent(page)
}
