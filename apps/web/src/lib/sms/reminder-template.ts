// GitHub issue #41 / Prompt 7.3, GÖREV 3 — "Şablon klinik ayarlarında
// özelleştirilebilir". lib/share/message-template.ts (GitHub #36, WhatsApp
// şablonu) ile AYNI desen: SAF (network/DB'ye dokunmayan) fonksiyonlar, hem
// sunucu tarafı gönderim (reminder-runner.ts) hem testler tarafından kullanılır.
export const SMS_TEMPLATE_PLACEHOLDERS = ['{danisanAdi}', '{tarih}', '{saat}', '{klinikAdi}'] as const

// SMS BİLEREK kısa — Netgsm gibi sağlayıcılar 160 karakter üstünde birden
// fazla mesaj ücreti/parçası uygular (roadmap "kota takibi" ile doğrudan
// ilişkili: uzun bir varsayılan şablon kotayı gereksiz hızlı tüketir).
export const DEFAULT_SMS_REMINDER_TEMPLATE =
  'Sayın {danisanAdi}, {klinikAdi} randevunuz {tarih} tarihinde saat {saat}\'de. İyi günler dileriz.'

export interface SmsReminderTemplateVars {
  clientName: string
  clinicName: string
  appointmentDate: string // 'GG.AA.YYYY'
  appointmentTime: string // 'SS:DD'
}

export function renderSmsReminderMessage(template: string | null, vars: SmsReminderTemplateVars): string {
  const source = template && template.trim().length > 0 ? template : DEFAULT_SMS_REMINDER_TEMPLATE
  return source
    .replaceAll('{danisanAdi}', vars.clientName)
    .replaceAll('{tarih}', vars.appointmentDate)
    .replaceAll('{saat}', vars.appointmentTime)
    .replaceAll('{klinikAdi}', vars.clinicName)
}
