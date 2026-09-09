import { describe, expect, it } from 'vitest'
import {
  buildClinicalReviewerInvitationEmail,
  buildClinicalReviewerVerificationEmail,
} from './clinical-reviewer-invitation'

describe('clinical reviewer invitation email', () => {
  it('contains the activation link but no clinical task details', () => {
    const email = buildClinicalReviewerInvitationEmail({
      email: 'reviewer@example.com',
      name: '<Reviewer>',
      professionalRole: 'Eczacı',
      specialty: 'Klinik Eczacılık',
      invitationUrl: 'https://app.example/clinical-review/davet?token=secret',
      expiresAt: new Date('2026-09-16T10:00:00Z'),
    })
    expect(email.subject).toBe('Ogun Clinical Review davetiniz')
    expect(email.html).toContain('token=secret')
    expect(email.html).toContain('&lt;Reviewer&gt;')
    expect(email.text).toContain('tek kullanımlıktır')
    expect(email.text).toContain('Meslek: Eczacı')
    expect(email.text).not.toContain('candidateId')
    expect(email.text).not.toContain('taskId')
  })

  it('builds the post-verification access notification without clinical content', () => {
    const email = buildClinicalReviewerVerificationEmail({
      email: 'reviewer@example.com',
      name: '<Reviewer>',
      assignedReviewsUrl: 'https://app.example/clinical-review/assigned',
    })
    expect(email.subject).toBe('Ogun Clinical Review erişiminiz etkinleştirildi')
    expect(email.html).toContain('&lt;Reviewer&gt;')
    expect(email.html).toContain('/clinical-review/assigned')
    expect(JSON.stringify(email)).not.toContain('taskId')
  })
})
