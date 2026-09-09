import { describe, expect, it } from 'vitest'
import { buildSupportTicketEmail } from './support-ticket'

describe('support ticket email', () => {
  it('renders Turkish HTML/text and escapes public content', () => {
    const email = buildSupportTicketEmail({ type: 'resolved', recipientEmail: 'owner@example.test', referenceCode: 'SUP-ABCDEFGH', title: '<Örnek>', statusLabel: 'Çözüldü', ticketUrl: 'https://app.example/ayarlar/destek/id', messagePreview: '<script>özet</script>' })
    expect(email.subject).toBe('Destek talebiniz çözüldü — SUP-ABCDEFGH')
    expect(email.text).toContain('Talebi görüntüle')
    expect(email.html).toContain('&lt;script&gt;')
    expect(email.html).not.toContain('<script>')
  })
})
