// GitHub issue #40 / Prompt 7.2, GÖREV 4 — e-SMM (e-serbest meslek makbuzu)
// hazırlığı. lib/email/types.ts (GitHub issue #36) ile BİREBİR AYNI desen:
// InvoiceProvider, gerçek sağlayıcıyı (Paraşüt/BirFatura API'si) çağıran
// koddan SOYUTLAR — roadmap'in açık talimatı ("Paraşüt/BirFatura entegrasyonu
// için servis arayüzü tanımla, implementasyonu şimdilik 'manuel' sağlayıcı
// olsun [...] gerçek entegrasyon pilot sonrası"). Çağıran kod (payment
// actions) SADECE bu arayüze karşı yazılır, hangi implementasyonun (bkz.
// manual-provider.ts) kullanıldığını BİLMEZ — ileride ParasutInvoiceProvider
// eklenince SADECE index.ts değişir.
export interface InvoiceReceiptInput {
  paymentId: string
  clientName: string
  clientTaxId?: string | null
  amount: string
  paidAt: Date
  // Diyetisyenin elle girdiği seri/sıra no (manuel sağlayıcıda ZORUNLU
  // değil — makbuz bilgisi sonradan da tamamlanabilir, bkz. schema/billing.ts
  // payments.receiptSeries üstündeki not).
  series?: string | null
  sequenceNumber?: string | null
}

export interface IssuedReceipt {
  provider: InvoiceProviderName
  series: string | null
  sequenceNumber: string | null
  // Kesim tarihi — YYYY-MM-DD (payments.receiptIssuedAt ile AYNI format).
  issuedAt: string
  // Gerçek sağlayıcılarda (Paraşüt/BirFatura) API'nin döndürdüğü fatura/makbuz
  // kimliği — manuel sağlayıcıda her zaman null (dış sistemde bir karşılığı
  // yok).
  externalId: string | null
}

export type InvoiceProviderName = 'manuel' | 'parasut' | 'birfatura'

export interface InvoiceProvider {
  readonly name: InvoiceProviderName
  issueReceipt(input: InvoiceReceiptInput): Promise<IssuedReceipt>
}
