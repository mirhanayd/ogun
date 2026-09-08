export interface PasswordResetEmailInput {
  resetUrl: string
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput) {
  const safeUrl = escapeHtml(input.resetUrl)
  return {
    subject: 'Ogun şifre sıfırlama',
    text: [
      'Şifrenizi sıfırlamak için aşağıdaki bağlantıyı kullanabilirsiniz.',
      '',
      input.resetUrl,
      '',
      'Bu işlemi siz istemediyseniz bu e-postayı dikkate almayabilirsiniz.',
      'Bağlantı yalnızca sınırlı süre geçerlidir.',
    ].join('\n'),
    html: `<div style="background:#f6f7f4;padding:32px 16px;font-family:Inter,Arial,sans-serif;color:#17211b"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e9e3;border-radius:16px;padding:32px"><p style="margin:0 0 20px;font-size:13px;font-weight:700;letter-spacing:.08em;color:#397250">OGUN</p><h1 style="margin:0 0 14px;font-size:24px">Şifrenizi sıfırlayın</h1><p style="line-height:1.6">Şifrenizi sıfırlamak için aşağıdaki bağlantıyı kullanabilirsiniz.</p><a href="${safeUrl}" style="display:inline-block;margin:10px 0 18px;background:#397250;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">Şifremi Sıfırla</a><p style="font-size:13px;line-height:1.6;color:#657269">Bu işlemi siz istemediyseniz bu e-postayı dikkate almayabilirsiniz. Bağlantı yalnızca sınırlı süre geçerlidir.</p></div></div>`,
  }
}
