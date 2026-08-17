import type { InvoiceProvider, InvoiceReceiptInput, IssuedReceipt } from './types'

// "Manuel" sağlayıcı — GitHub issue #40 / Prompt 7.2, GÖREV 4'ün istediği TEK
// implementasyon. Hiçbir dış API çağırmaz: diyetisyen makbuz seri/sıra
// numarasını KENDİ elle yazdığı fiziksel/harici e-SMM aracından (ör. GİB
// portalı, muhasebecinin kestiği makbuz) alıp ödeme formuna girer, bu
// sağlayıcı sadece o girdiyi doğrulayıp kesim tarihini (issuedAt) BUGÜN
// olarak damgalar — gerçek bir entegrasyon YOK, sadece kayıt tutuyor.
export function createManualInvoiceProvider(): InvoiceProvider {
  return {
    name: 'manuel',
    async issueReceipt(input: InvoiceReceiptInput): Promise<IssuedReceipt> {
      return {
        provider: 'manuel',
        series: input.series?.trim() || null,
        sequenceNumber: input.sequenceNumber?.trim() || null,
        issuedAt: input.paidAt.toISOString().slice(0, 10),
        externalId: null,
      }
    },
  }
}
