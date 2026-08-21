import { describe, expect, it } from 'vitest'
import { clinicInvitationEmail } from './clinic-invitation-template'

describe('clinicInvitationEmail', () => {
  const input = {
    recipientName: 'Dyt. Ayşe Yılmaz',
    clinicName: 'İyi Yaşam Kliniği',
    inviterName: 'Dr. Deniz Kaya',
    invitationUrl: 'https://app.ogun.test/davet/tek-kullanimlik-token',
    expiresAt: new Date('2026-08-28T12:00:00+03:00'),
  }

  it('kurum yöneticisini, rolü ve şifre oluşturma bağlantısını açıkça anlatır', () => {
    const email = clinicInvitationEmail(input)
    expect(email.subject).toContain('İyi Yaşam Kliniği')
    expect(email.text).toContain('kurumunun yöneticisi')
    expect(email.text).toContain('şifrenizi oluşturmak')
    expect(email.text).toContain(input.invitationUrl)
    expect(email.html).toContain('Şifremi oluştur ve katıl')
  })

  it('kullanıcı kaynaklı HTML içeriğini escape eder', () => {
    const email = clinicInvitationEmail({ ...input, recipientName: '<script>alert(1)</script>' })
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
  })
})
