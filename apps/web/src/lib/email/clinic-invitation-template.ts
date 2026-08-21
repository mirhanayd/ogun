export interface ClinicInvitationEmailData {
  recipientName: string
  clinicName: string
  inviterName: string
  invitationUrl: string
  expiresAt: Date
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(date)
}

export function clinicInvitationEmail(data: ClinicInvitationEmailData) {
  const recipientName = escapeHtml(data.recipientName)
  const clinicName = escapeHtml(data.clinicName)
  const inviterName = escapeHtml(data.inviterName)
  const invitationUrl = escapeHtml(data.invitationUrl)
  const expiresOn = formatDate(data.expiresAt)

  return {
    subject: `${data.clinicName} ekibine davet edildiniz`,
    text: [
      `Merhaba ${data.recipientName},`,
      '',
      `${data.inviterName}, ${data.clinicName} kurumunun yöneticisi olarak sizi Öğün'e diyetisyen olarak davet etti.`,
      'Hesabınızı etkinleştirmek ve şifrenizi oluşturmak için aşağıdaki bağlantıyı açın:',
      data.invitationUrl,
      '',
      `Bu tek kullanımlık bağlantı ${expiresOn} tarihine kadar geçerlidir.`,
      'Bu daveti beklemiyorsanız e-postayı yok sayabilirsiniz.',
    ].join('\n'),
    html: `
      <div style="background:#f6f7f4;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#17211b">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e9e3;border-radius:16px;padding:32px">
          <p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:.08em;color:#397250">ÖĞÜN</p>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25">${clinicName} ekibine davet edildiniz</h1>
          <p style="margin:0 0 12px;line-height:1.6">Merhaba ${recipientName},</p>
          <p style="margin:0 0 24px;line-height:1.6"><strong>${inviterName}</strong>, ${clinicName} kurumunun yöneticisi olarak sizi Öğün'e diyetisyen olarak davet etti.</p>
          <a href="${invitationUrl}" style="display:inline-block;background:#397250;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Şifremi oluştur ve katıl</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#657269">Bu tek kullanımlık bağlantı ${expiresOn} tarihine kadar geçerlidir. Daveti beklemiyorsanız bu e-postayı yok sayabilirsiniz.</p>
        </div>
      </div>
    `.trim(),
  }
}
