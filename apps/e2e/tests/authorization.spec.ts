import { expect, test } from '@playwright/test'
import { loadE2eCredentials, loginAndEnsureOnboarded } from '../fixtures/auth'

// GitHub issue #45 / Prompt 8.1, GÖREV 3 — yetkilendirme testi: A kliniğinin
// kullanıcısı B kliniğinin danışanına erişemesin. seed-e2e.ts GERÇEK iki
// klinik + GERÇEK farklı clinicId'li bir danışan oluşturuyor (mock DEĞİL) —
// bu test apps/web/src/lib/authz.ts'teki ClinicScope kuralının (bkz. o
// dosyanın dosya başı notu: "danışan verisine dokunan HER sorgu clinicId ile
// filtrelenir") gerçekten UYGULANDIĞINI, sadece kod yorumunda YAZILI
// olmadığını kanıtlıyor.
test.describe('Kiracılar arası izolasyon', () => {
  test('A kliniğinin kullanıcısı B kliniğinin danışan sayfasına erişemez', async ({ page }) => {
    const credentials = loadE2eCredentials()

    await loginAndEnsureOnboarded(page, credentials.clinicA.email, credentials.clinicA.password)

    // apps/web/src/app/(app)/danisanlar/[id]/page.tsx — viewClientRecord
    // (withAuth+withAudit, ClinicScope ile filtrelenmiş) klinik B'nin
    // danışanı için null döner → notFound(). GERÇEK bir çalıştırmada (bkz.
    // bu testin ilk canlı koşusu) HTTP yanıt kodunun KENDİSİ 200 geliyor —
    // Next.js 15 App Router'da (app)/ route group'unun kök layout'u zaten
    // bir shell render ettiği için notFound() boundary'si BU İÇ İÇE
    // layout'un İÇİNDE devreye giriyor, dış HTTP durumu her zaman 404'e
    // YÜKSELTİLMİYOR (bilinen bir Next.js App Router nüansı — ayrı bir
    // not-found.tsx bu route grubuna EKLENMEDİĞİ sürece). Asıl KVKK/güvenlik
    // vaadi HTTP durum kodu DEĞİL, "danışanın verisi hiçbir biçimde
    // görünmüyor" — bu yüzden asıl doğrulama İÇERİK üzerinden yapılıyor:
    // "404" başlığı GÖRÜNMELİ, danışanın adı/soyadı HİÇ görünmemeli.
    await page.goto(`/danisanlar/${credentials.clinicB.clientId}`)
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
    await expect(page.getByText('Gizli')).toHaveCount(0)
    await expect(page.getByText('DanışanB')).toHaveCount(0)
  })

  test('A kliniğinin kullanıcısı B kliniğinin danışanını arama sonuçlarında göremez', async ({ page }) => {
    const credentials = loadE2eCredentials()
    await loginAndEnsureOnboarded(page, credentials.clinicA.email, credentials.clinicA.password)

    // api/clients/search — requireClinic() ile korunan, klinik bazlı arama
    // uç noktası (bkz. o route dosyasının dosya başı notu).
    const response = await page.request.get('/api/clients/search?q=Gizli')
    expect(response.ok()).toBeTruthy()
    const results = (await response.json()) as Array<{ id: string; firstName: string; lastName: string }>
    expect(results.find((r) => r.id === credentials.clinicB.clientId)).toBeUndefined()
  })
})
