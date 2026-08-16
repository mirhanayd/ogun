// GitHub issue #36 / Prompt 6.2, GÖREV 2 — WhatsApp mesaj şablonu. SAF
// (network/DB'ye dokunmayan) fonksiyonlar — hem share-dialog.tsx (istemci,
// wa.me linkini oluşturmak için) hem testler (bkz. message-template.test.ts)
// tarafından kullanılır.
//
// Yer tutucular düz metin İÇİNDE {parantezli} biçimde — clinics.
// whatsappMessageTemplate sütunu bu şekli SERBEST METİN olarak tutar (bkz.
// schema/tenancy.ts notu), burası sadece bilinen üç yer tutucuyu değiştirir.
export const WHATSAPP_TEMPLATE_PLACEHOLDERS = ['{danisanAdi}', '{planAdi}', '{link}'] as const

export const DEFAULT_WHATSAPP_TEMPLATE =
  'Merhaba {danisanAdi}, "{planAdi}" adlı beslenme planınız hazır. Aşağıdaki bağlantıdan görüntüleyebilirsiniz:\n{link}'

export interface WhatsappTemplateVars {
  clientName: string
  planName: string
  shareUrl: string
}

export function renderWhatsappMessage(template: string | null, vars: WhatsappTemplateVars): string {
  const source = template && template.trim().length > 0 ? template : DEFAULT_WHATSAPP_TEMPLATE
  return source
    .replaceAll('{danisanAdi}', vars.clientName)
    .replaceAll('{planAdi}', vars.planName)
    .replaceAll('{link}', vars.shareUrl)
}

// wa.me deep link — roadmap GÖREV 2: "hazır mesaj metni + link ile wa.me
// deep link (v1 için yeterli, API'ye gerek yok)". wa.me numarayı ülke
// koduyla, BAŞINDA + veya 0 OLMADAN ister (bkz.
// https://faq.whatsapp.com/425247423055198). Türkiye'deki yaygın giriş
// biçimleri (0555..., +90555..., 0(555)...) normalize edilir; numara
// zaten 90 ile başlıyorsa dokunulmaz, 0 ile başlıyorsa 0 atılıp 90 eklenir,
// aksi halde (ne 0 ne 90 ile başlıyorsa, 10 haneli yerel numara varsayılır)
// başına 90 eklenir.
export function normalizeTurkishPhoneForWhatsapp(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.startsWith('90') && digits.length === 12) return digits
  if (digits.startsWith('0') && digits.length === 11) return `90${digits.slice(1)}`
  if (digits.length === 10) return `90${digits}`
  // Zaten uluslararası biçimde (ör. başka bir ülke kodu) — olduğu gibi
  // bırak, en azından rakam dışı karakterlerden arındırılmış olsun.
  return digits
}

export function buildWhatsappShareUrl(phone: string | null, message: string): string {
  const normalized = phone ? normalizeTurkishPhoneForWhatsapp(phone) : null
  const encoded = encodeURIComponent(message)
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`
}
