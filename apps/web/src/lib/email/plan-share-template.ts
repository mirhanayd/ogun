// GitHub issue #36 / Prompt 6.2, GÖREV 3 — "Türkçe e-posta şablonu, klinik
// markalı". SAF bir render fonksiyonu (network/DB YOK) — hem
// share-actions.ts (gerçek gönderim) hem testler (bkz.
// plan-share-template.test.ts) tarafından kullanılır, "gönderme mantığından
// bağımsız test edilebilir olsun" gereğinin karşılığı (görev talimatı).
//
// Marka kaynağı: #35'in zaten kurduğu PdfClinicBranding şekliyle AYNI alanlar
// (clinic.name/logoUrl/primaryColor) — burada packages/pdf'e bağımlılık
// EKLENMEDİ (e-posta HTML'i react-pdf'ten TAMAMEN ayrı bir render yolu), ama
// "aynı marka kaynağını kullan" talimatı gereği alan adları BİLEREK
// resolve-plan-pdf-data.ts'in ürettiği PdfClinicBranding ile birebir eşleşiyor.
export interface PlanShareEmailInput {
  clinicName: string
  clinicLogoDataUri: string | null
  clinicPrimaryColor: string | null
  clientName: string
  planName: string
  dietitianName: string | null
  shareUrl: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

const DEFAULT_PRIMARY_COLOR = '#16a34a'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function renderPlanShareEmail(input: PlanShareEmailInput): RenderedEmail {
  const color = input.clinicPrimaryColor ?? DEFAULT_PRIMARY_COLOR
  const dietitianLine = input.dietitianName ? `Diyetisyeniniz ${input.dietitianName} tarafından hazırlandı.` : ''
  const subject = `${input.clinicName} — "${input.planName}" beslenme planınız hazır`

  const text = [
    `Merhaba ${input.clientName},`,
    '',
    `"${input.planName}" adlı beslenme planınız hazır. ${dietitianLine}`.trim(),
    '',
    `Planı görüntülemek için: ${input.shareUrl}`,
    '',
    'Bu bağlantı sadece plan içeriğinizi gösterir, kişisel sağlık verileriniz paylaşılmaz.',
    '',
    input.clinicName,
  ]
    .filter((line) => line !== undefined)
    .join('\n')

  const html = `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:${escapeHtml(color)};padding:20px 24px;">
                ${
                  input.clinicLogoDataUri
                    ? `<img src="${escapeHtml(input.clinicLogoDataUri)}" alt="${escapeHtml(input.clinicName)}" height="36" style="display:block;" />`
                    : `<span style="color:#ffffff;font-size:18px;font-weight:600;">${escapeHtml(input.clinicName)}</span>`
                }
              </td>
            </tr>
            <tr>
              <td style="padding:24px;color:#18181b;font-size:14px;line-height:1.6;">
                <p>Merhaba <strong>${escapeHtml(input.clientName)}</strong>,</p>
                <p>&ldquo;${escapeHtml(input.planName)}&rdquo; adlı beslenme planınız hazır.${
                  input.dietitianName ? ` Diyetisyeniniz <strong>${escapeHtml(input.dietitianName)}</strong> tarafından hazırlandı.` : ''
                }</p>
                <p style="text-align:center;margin:28px 0;">
                  <a href="${escapeHtml(input.shareUrl)}" style="background-color:${escapeHtml(color)};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">
                    Planımı görüntüle
                  </a>
                </p>
                <p style="color:#71717a;font-size:12px;">
                  Bu bağlantı sadece plan içeriğinizi gösterir; kişisel sağlık verileriniz (ölçümler, notlar vb.) hiçbir zaman paylaşılmaz.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;background-color:#fafafa;color:#a1a1aa;font-size:11px;">
                ${escapeHtml(input.clinicName)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
