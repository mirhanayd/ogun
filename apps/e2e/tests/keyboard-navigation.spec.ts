import { expect, test } from '@playwright/test'
import { loadE2eCredentials, loginAndEnsureOnboarded } from '../fixtures/auth'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 3 — "Plan editöründe Tab
// sırasını UÇTAN UCA test et: arama → miktar → sonraki kalem."
//
// BU TEST BİR GERÇEK HATA ORTAYA ÇIKARDI (ve düzeltmenin bekçisidir):
// FoodSearchInput'un `quantityInputRef` prop'u — yani "Tab ile miktar alanına
// geç" davranışının TEK mekanizması — YALNIZCA geliştirme oyun alanında
// (app/dev/food-search-input/page.tsx) bağlanmıştı. Gerçek plan editörü
// (meal-block.tsx) bu prop'u HİÇ vermiyordu, dolayısıyla arama kutusunda
// Tab'a basmak tarayıcının varsayılan sırasını izliyordu; kalem satırları
// DOM'da arama kutusundan ÖNCE geldiği için odak miktar hücresine DEĞİL, bir
// SONRAKİ ÖĞÜN BLOĞUNA atlıyordu. Düzeltme: meal-block.tsx artık
// `onTabToAmount` ile son eklenen kalemin miktar hücresine odaklanıyor
// (bkz. food-search-input.tsx'teki prop notu).
//
// Seçici olarak `[data-amount-cell]` kullanılıyor: miktar hücresi tıklanana
// kadar bir <button>, tıklandıktan sonra bir <input> (bkz. plan-item-row.tsx
// AmountEditor — "modal yok" deseni), yani rol tabanlı bir seçici iki durumu
// birden yakalayamazdı.
test.describe('Klavye gezinmesi', () => {
  test('plan editörü Tab sırası: arama → miktar → sonraki kalem', async ({ page }) => {
    // critical-flow.spec.ts ile AYNI gerekçe: /api/foods/index (15.402 besin)
    // bu sandbox'ta yavaş; süre cömert tutuldu.
    test.setTimeout(240_000)
    const credentials = loadE2eCredentials()

    await loginAndEnsureOnboarded(page, credentials.clinicA.email, credentials.clinicA.password)
    await expect(page).toHaveURL(/\/panel/)

    // --- Kısayol yardım kartı (? tuşu) hâlâ açılıyor mu ----------------------
    // GÖREV 3'ün "yardım kartı güncel olduğunu doğrula" maddesi: kartın
    // İÇERİĞİ #53 (native menü) ve #61 (araç çubuğu) sonrası güncellendi;
    // burada kartın hâlâ '?' ile AÇILDIĞINI ve yeni satırları GÖSTERDİĞİNİ
    // doğruluyoruz.
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog').getByText('Klavye kısayolları')).toBeVisible()
    await expect(
      page.getByText('Kaydet ve sıradaki alana geç (arama → miktar → sonraki kalem)'),
    ).toBeVisible()
    await page.keyboard.press('Escape')

    // --- Danışan + plan hazırla ---------------------------------------------
    await page.goto('/danisanlar/yeni')
    const uniqueSuffix = Date.now().toString(36)
    await page.getByLabel('Ad', { exact: true }).fill('Klavye')
    await page.getByLabel('Soyad').fill(`Testi${uniqueSuffix}`)
    await page.getByText('KVKK aydınlatma metnini okudum').click()
    await page.getByText('Özel nitelikli (sağlık) verimin işlenmesine').click()
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await page.waitForURL(/\/danisanlar\/(?!yeni)[^/]+$/)
    const clientId = page.url().split('/danisanlar/')[1]!.split(/[/?#]/)[0]!

    await page.goto(`/danisanlar/${clientId}`)
    await page.getByRole('tab', { name: 'Planlar' }).click()
    await page.getByRole('button', { name: 'Yeni plan' }).first().click()
    await page.waitForURL(/\/planlar\/[^/]+$/)

    // --- İlk öğüne iki kalem ekle -------------------------------------------
    const foodSearchInput = page.locator('input[placeholder*="için besin ara"]').first()
    await expect(foodSearchInput).toBeEnabled({ timeout: 150_000 })
    for (const query of ['a', 'e']) {
      await foodSearchInput.click()
      await foodSearchInput.fill(query)
      await expect(page.locator('ul li button').first()).toBeVisible({ timeout: 15_000 })
      await foodSearchInput.press('ArrowDown')
      await foodSearchInput.press('Enter')
      await expect(foodSearchInput).toHaveValue('')
    }
    const amountCells = page.locator('[data-amount-cell]')
    await expect(amountCells).toHaveCount(2)

    // --- ADIM 1: arama → miktar ---------------------------------------------
    await foodSearchInput.click()
    await foodSearchInput.press('Tab')
    // Odak, EN SON eklenen kalemin miktar hücresinde olmalı.
    await expect(amountCells.last()).toBeFocused()

    // --- ADIM 2: miktar hücresi klavyeyle düzenlenebilmeli --------------------
    // İlk kalemin miktarına geç (aşağıda "sonraki kalem" adımı için ilk
    // kalemden başlamak gerekiyor).
    await amountCells.first().click()
    const amountInput = page.locator('input[data-amount-cell]')
    await expect(amountInput).toBeFocused()
    await amountInput.fill('123')
    await amountInput.press('Tab')
    // Tab hem KAYDETMELİ hem de odağı ilerletmeli (bkz. plan-item-row.tsx
    // AmountEditor onKeyDown).
    await expect(page.locator('input[data-amount-cell]')).toHaveCount(0)
    await expect(amountCells.first()).toHaveText(/123\s*g/)

    // --- ADIM 3: → sonraki kalem ---------------------------------------------
    // İlk kalemin miktarından sonra, YALNIZCA Tab'a basarak ikinci kalemin
    // miktar hücresine ulaşılabilmeli. Aradaki adım sayısı satırın diğer
    // denetimlerine (alternatif ekle, sil, sürükleme tutamağı) bağlı olduğu
    // için sabit bir sayı VARSAYILMIYOR; sınırlı bir döngüyle aranıyor.
    let reachedNextItem = false
    for (let step = 0; step < 8; step += 1) {
      if (await amountCells.nth(1).evaluate((node) => node === node.ownerDocument.activeElement)) {
        reachedNextItem = true
        break
      }
      await page.keyboard.press('Tab')
    }
    expect(
      reachedNextItem,
      'İlk kalemin miktar hücresinden sonra ikinci kalemin miktar hücresine sadece Tab ile ulaşılamadı.',
    ).toBe(true)
  })
})
