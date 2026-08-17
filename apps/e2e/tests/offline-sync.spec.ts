import { expect, test } from '@playwright/test'
import { loadE2eCredentials, loginAndEnsureOnboarded } from '../fixtures/auth'

// GitHub issue #45 / Prompt 8.1, GÖREV 3 — çevrimdışı senaryo: bağlantıyı
// kes, plan düzenle, bağlan, senkronizasyonu doğrula. lib/offline-queue.ts
// (GitHub #25) GERÇEK davranışını (window 'online'/'offline' event'leri,
// bkz. plan-editor.tsx satır ~137-144) tarayıcı seviyesinde tetikliyoruz —
// context.setOffline() Chromium'da navigator.onLine'ı GERÇEKTEN false yapar
// ve 'offline'/'online' event'lerini dispatch eder, bu bir mock DEĞİL.
test.describe('Çevrimdışı senkronizasyon', () => {
  test('bağlantı kesilince yerel kaydeder, bağlanınca senkronize eder', async ({ page, context }) => {
    test.setTimeout(60_000)
    const credentials = loadE2eCredentials()

    await loginAndEnsureOnboarded(page, credentials.clinicA.email, credentials.clinicA.password)

    // Kendi (izole) danışan/planını oluştur — kritik akış testiyle veri
    // paylaşmamak için.
    await page.goto('/danisanlar/yeni')
    const suffix = Date.now().toString(36)
    await page.getByLabel('Ad', { exact: true }).fill('Offline')
    await page.getByLabel('Soyad').fill(`Test${suffix}`)
    await page.getByText('KVKK aydınlatma metnini okudum').click()
    await page.getByText('Özel nitelikli (sağlık) verimin işlenmesine').click()
    await page.getByRole('button', { name: 'Kaydet' }).click()
    // bkz. critical-flow.spec.ts'teki AYNI notu — "/yeni" hariç tutuluyor.
    await page.waitForURL(/\/danisanlar\/(?!yeni)[^/]+$/)

    await page.getByRole('tab', { name: 'Planlar' }).click()
    // bkz. critical-flow.spec.ts — NewPlanButton birden fazla yerde render ediliyor.
    await page.getByRole('button', { name: 'Yeni plan' }).first().click()
    await page.waitForURL(/\/planlar\/[^/]+$/)

    // İlk öğün bloğunun başlığı (varsayılan öğün adı, ör. "Kahvaltı").
    const mealTitleButton = page.locator('button.truncate').first()
    const originalName = (await mealTitleButton.textContent())!.trim()
    const offlineName = `${originalName} (çevrimdışı düzenlendi ${suffix})`

    // --- Bağlantıyı kes -------------------------------------------------------
    await context.setOffline(true)

    await mealTitleButton.click()
    const activeInput = page.locator('input.h-7').first()
    await activeInput.fill(offlineName)
    await activeInput.press('Enter')

    // GÖREV 4'ün beklediği gösterge — offline-queue.ts'in enqueue() 'immediate'
    // OLMAYAN çağrısı 800ms debounce'tan sonra "gönderilmeye çalışılır" ve
    // navigator.onLine=false olduğu için 'offline' durumuna düşer.
    await expect(page.getByText('Bağlantı yok, yerel kayıt')).toBeVisible({ timeout: 5_000 })

    // Sayfa hâlâ çevrimdışıyken düzenlemenin GÖRSEL olarak uygulandığını
    // (yerel taslak state'i) doğrula — sunucuya gitmemiş olsa da UI güncel.
    await expect(page.locator('button.truncate').first()).toHaveText(offlineName)

    // --- Bağlan ve senkronizasyonu doğrula -------------------------------------
    await context.setOffline(false)
    await expect(page.getByText('Kaydedildi')).toBeVisible({ timeout: 15_000 })

    // Sayfayı YENİDEN yükleyip sunucudan GERÇEKTEN okuyarak (yerel state'e
    // güvenmeden) senkronizasyonun kalıcı olduğunu kanıtla.
    await page.reload()
    await expect(page.locator('button.truncate').first()).toHaveText(offlineName, { timeout: 10_000 })
  })
})
