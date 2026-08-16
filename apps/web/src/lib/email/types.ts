// GitHub issue #36 / Prompt 6.2, GÖREV 3 — "Resend veya SMTP". EmailSender,
// gerçek gönderim mekanizmasını (Resend API, SMTP, ...) çağıran koddan
// SOYUTLAR — mimari kural gereği DEĞİL, açıkça istenen bir gereklilik
// (görev talimatı: "make the actual send function swappable behind a small
// interface so it's not hard-wired, in case the repo owner wants to switch
// later"). share-actions.ts SADECE bu arayüze karşı yazılır, hangi
// implementasyonun (bkz. resend-sender.ts) kullanıldığını BİLMEZ.
export interface EmailAttachment {
  filename: string
  contentType: string
  content: Buffer
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  attachments?: EmailAttachment[]
}

export interface EmailSender {
  send(input: SendEmailInput): Promise<void>
}
