import { expect, test } from '@playwright/test'

// Ağır bir tanı (diagnostic) testi — bu sandbox'ta Playwright/Chromium'un
// GERÇEKTEN çalışıp çalışmadığını, karmaşık login/onboarding akışlarından
// BAĞIMSIZ olarak doğrulamak için eklendi (bkz. apps/e2e/fixtures/auth.ts
// dosya başındaki "CardTitle bir <div>, <hN> DEĞİL" notu — bu test o
// bulgunun DOĞRUDAN kanıtı).
test('giris sayfası açılır ve e-posta alanı görünür', async ({ page }) => {
  await page.goto('/giris')
  await expect(page.getByLabel('E-posta')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible()
})
