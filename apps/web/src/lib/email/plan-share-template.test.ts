import { describe, expect, it } from 'vitest'
import { renderPlanShareEmail } from './plan-share-template'

// GitHub issue #36 / Prompt 6.2 — VERİFİKASYON gereği: "assert the rendered
// HTML/text contains expected clinic branding and Turkish content" —
// gerçek bir e-posta ASLA gönderilmeden (Resend API'sine hiç dokunmadan)
// render çıktısı doğrulanır.
describe('renderPlanShareEmail', () => {
  const baseInput = {
    clinicName: 'Beslenme Kliniği',
    clinicLogoDataUri: null,
    clinicPrimaryColor: null,
    clientName: 'Ayşe Yılmaz',
    planName: 'Kilo verme planı',
    dietitianName: 'Dyt. Zeynep Kaya',
    shareUrl: 'https://ogun.app/p/abc123',
  }

  it('Türkçe içerik + klinik adını konu satırına ekler', () => {
    const { subject } = renderPlanShareEmail(baseInput)
    expect(subject).toContain('Beslenme Kliniği')
    expect(subject).toContain('Kilo verme planı')
  })

  it('düz metin sürümü danışan adını, plan adını ve linki içerir', () => {
    const { text } = renderPlanShareEmail(baseInput)
    expect(text).toContain('Ayşe Yılmaz')
    expect(text).toContain('Kilo verme planı')
    expect(text).toContain('https://ogun.app/p/abc123')
    expect(text).toContain('sağlık verileriniz')
  })

  it('HTML sürümü diyetisyen adını ve klinik markasını (logo yoksa metin) içerir', () => {
    const { html } = renderPlanShareEmail(baseInput)
    expect(html).toContain('Dyt. Zeynep Kaya')
    expect(html).toContain('Beslenme Kliniği')
    expect(html).toContain(baseInput.shareUrl)
  })

  it('logo varsa <img> ile, primaryColor varsa marka rengiyle render eder', () => {
    const { html } = renderPlanShareEmail({
      ...baseInput,
      clinicLogoDataUri: 'data:image/png;base64,AAAA',
      clinicPrimaryColor: '#ff0000',
    })
    expect(html).toContain('data:image/png;base64,AAAA')
    expect(html).toContain('#ff0000')
  })

  it('kullanıcı girdisindeki HTML özel karakterlerini escape eder (XSS önleme)', () => {
    const { html } = renderPlanShareEmail({
      ...baseInput,
      clientName: '<script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('diyetisyen adı yoksa o cümleyi hiç eklemez', () => {
    const { text } = renderPlanShareEmail({ ...baseInput, dietitianName: null })
    expect(text).not.toContain('Diyetisyeniniz')
  })
})
