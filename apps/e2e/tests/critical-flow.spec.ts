import { expect, test } from '@playwright/test'
import { loadE2eCredentials, loginAndEnsureOnboarded } from '../fixtures/auth'

// GitHub issue #45 / Prompt 8.1, GÖREV 3 — kritik akış: giriş → danışan
// oluştur → ölçüm gir → plan oluştur → 3 besin ekle → PDF üret → paylaş.
// Roadmap'in BİREBİR istediği zincir — her adım GERÇEK sayfa/bileşen
// markup'ına karşı çalışır (bkz. bu dosyayı yazmadan önce okunan
// new-client-form.tsx, measurement-form.tsx, meal-block.tsx,
// plan-pdf-dialog.tsx, share-dialog.tsx — seçiciler oradan BİREBİR alındı).
test.describe('Kritik akış', () => {
  test('giriş → danışan → ölçüm → plan → 3 besin → PDF → paylaşım', async ({ page }) => {
    const credentials = loadE2eCredentials()
    // NOT: /api/foods/index (GERÇEK 15.402 besinlik katalog, tam besin öğesi
    // haritalarıyla — bkz. GitHub #26) bu sandbox'ta TEK BAŞINA ~20 saniyede
    // yanıt veriyor (gzip'li 3.1 MB — roadmap'in "10.000 besin için <1.5 MB"
    // hedefini AŞIYOR, bkz. docs/performance.md); istemci tarafı Dexie/Orama
    // indeks kurulumu da eklenince ilk besin aramasının hazır olması BU
    // sandbox'ta uzun sürüyor. Test süresi buna göre CÖMERTÇE ayarlandı.
    test.setTimeout(240_000)

    await loginAndEnsureOnboarded(page, credentials.clinicA.email, credentials.clinicA.password)
    await expect(page).toHaveURL(/\/panel/)

    // --- Danışan oluştur ----------------------------------------------------
    await page.goto('/danisanlar/yeni')
    const uniqueSuffix = Date.now().toString(36)
    await page.getByLabel('Ad', { exact: true }).fill('Test')
    await page.getByLabel('Soyad').fill(`Danışanı${uniqueSuffix}`)
    await page.getByLabel('Telefon').fill('0532 111 22 33')
    await page.getByLabel('Doğum tarihi').fill('1990-01-15')
    await page.getByText('KVKK aydınlatma metnini okudum').click()
    await page.getByText('Özel nitelikli (sağlık) verimin işlenmesine').click()
    await page.getByRole('button', { name: 'Kaydet' }).click()
    // GERÇEK BİR HATA NOTU: `/\/danisanlar\/[^/]+$/` BAŞLANGIÇ url'i olan
    // /danisanlar/yeni'yi DE eşleştirir ("yeni" de [^/]+'e uyar) —
    // waitForURL() sayfa HENÜZ navigasyon yapmadan, MEVCUT url zaten
    // eşleştiği için ANINDA çözülür, bu da geçersiz bir clientId'ye
    // ("yeni") yol açar. "yeni" hariç tutuluyor.
    await page.waitForURL(/\/danisanlar\/(?!yeni)[^/]+$/)
    const clientId = page.url().split('/danisanlar/')[1]!.split(/[/?#]/)[0]!
    expect(clientId).toBeTruthy()

    // --- Ölçüm gir (hızlı mod: sadece kilo) ---------------------------------
    // Sekmeler bir URL query param'ı DEĞİL, Radix Tabs'ın istemci state'i
    // (bkz. app/(app)/danisanlar/[id]/page.tsx `<Tabs defaultValue="genel">`)
    // — bu yüzden bir sekme tetikleyicisine TIKLAMAK gerekiyor.
    await page.goto(`/danisanlar/${clientId}`)
    await page.getByRole('tab', { name: 'Ölçümler' }).click()
    await page.getByLabel('Kilo (kg)').fill('72.5')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    // measurement-form.tsx onSubmit başarıda formu resetler (router.refresh) —
    // hatasız devam ettiğimizi, formun tekrar boş "Kilo (kg)" alanıyla
    // göründüğünü bekleyerek doğruluyoruz (bkz. dosya başı notu: reset()).
    await expect(page.getByLabel('Kilo (kg)')).toHaveValue('', { timeout: 10_000 })

    // --- Plan oluştur --------------------------------------------------------
    await page.getByRole('tab', { name: 'Planlar' }).click()
    // NewPlanButton birden fazla yerde render ediliyor (Planlar sekmesinin
    // hem üst eylem alanında hem de boş durum içinde) — .first() ile
    // belirsizlik gideriliyor.
    await page.getByRole('button', { name: 'Yeni plan' }).first().click()
    await page.waitForURL(/\/planlar\/[^/]+$/)

    // --- 3 besin ekle (ilk öğün bloğundaki arama kutusuna) ------------------
    // meal-block.tsx, FoodSearchInput'un varsayılan placeholder'ını
    // `${mealTypeLabel} için besin ara… (ör. ...)` ile EZER — bu yüzden
    // kısmi (substring) eşleşme kullanılıyor, öğün tipinden bağımsız.
    const foodSearchInput = page.locator('input[placeholder*="için besin ara"]').first()
    // İndeks hazır olana kadar alan `disabled` ve placeholder'ı "Besin
    // indeksi yükleniyor…" olur (bkz. food-search-input.tsx) — /api/foods/
    // index'in GERÇEK boyutu (15.402 besin, tam besin öğesi haritalarıyla,
    // bkz. yukarıdaki test.setTimeout notu) + istemci tarafı Dexie/Orama
    // kurulumu bu sandbox'ta uzun sürebiliyor, bu yüzden CÖMERT bir süre
    // bekleniyor.
    await expect(foodSearchInput).toBeEnabled({ timeout: 150_000 })
    for (const query of ['a', 'e', 'i']) {
      await foodSearchInput.click()
      await foodSearchInput.fill(query)
      await expect(page.locator('ul li button').first()).toBeVisible({ timeout: 15_000 })
      await foodSearchInput.press('ArrowDown')
      await foodSearchInput.press('Enter')
      await expect(foodSearchInput).toHaveValue('')
    }
    // Eklenen 3 kalemin öğün bloğunda gerçekten göründüğünü doğrula.
    // GitHub issue #61 — ESKİ HÂLİ ÖLÇMÜYORDU: `[data-slot="card"]` seçicisi
    // shadcn Card bileşenine ait, plan editörü ise HİÇBİR YERDE Card
    // KULLANMIYOR (öğün blokları düz `div`) — yani bu beklenti hiçbir zaman
    // eşleşemezdi. Turu atlama düzeltmesiyle (bkz. fixtures/auth.ts) test ilk
    // kez buraya kadar ULAŞABİLDİĞİ için ortaya çıktı. Yerine GERÇEK ölçüm:
    // eklenen kalem sayısı kadar kalem satırı render edilmiş olmalı (her
    // satırın "Kalemi sil" düğmesi var, bkz. plan-item-row.tsx).
    await expect(page.getByRole('button', { name: 'Kalemi sil' })).toHaveCount(3)

    // --- PDF üret --------------------------------------------------------------
    // GitHub issue #61 — "PDF önizleme / indir" artık üst şeritte DEĞİL,
    // birincil eylemin ("Danışana ulaştır") yanındaki taşma menüsünde (bkz.
    // plan-editor.tsx EditorTopBar). İşlev AYNI, yalnızca bir tık ötede —
    // test de gerçek kullanıcının yapacağı gibi önce menüyü açıyor.
    await page.getByRole('button', { name: 'Diğer plan eylemleri' }).click()
    await page.getByRole('menuitem', { name: 'PDF önizleme / indir' }).click()
    await expect(page.getByRole('button', { name: 'İndir ve kaydet' })).toBeEnabled({ timeout: 20_000 })
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'İndir ve kaydet' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i)
    await page.getByRole('button', { name: 'Kapat' }).click()

    // --- Paylaş ------------------------------------------------------------
    await page.getByRole('button', { name: 'Danışana ulaştır' }).click()
    const shareLinkInput = page.locator('input[readonly]')
    await expect(shareLinkInput).toHaveValue(/\/p\//, { timeout: 15_000 })
  })
})
