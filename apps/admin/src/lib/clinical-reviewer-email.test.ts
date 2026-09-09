import { describe, expect, it, vi } from 'vitest'
import {
  sendClinicalReviewerInvitationEmail,
  sendClinicalReviewerVerificationEmail,
} from './clinical-reviewer-email'

describe('clinical reviewer email delivery', () => {
  it('uses the injected sender and does not include clinical details', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await sendClinicalReviewerInvitationEmail(
      {
        email: 'reviewer@test.invalid',
        name: 'Reviewer',
        professionalRole: 'Eczacı',
        specialty: 'Klinik Eczacılık',
        invitationUrl: 'https://web.test/clinical-review/davet?token=opaque',
        expiresAt: new Date('2026-09-16T00:00:00Z'),
      },
      { send },
    )
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      to: 'reviewer@test.invalid',
      subject: 'Ogun Clinical Review davetiniz',
    })
    expect(JSON.stringify(send.mock.calls[0]?.[0])).not.toContain('taskId')
  })

  it('sends the reviewer access notification through the injected sender', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await sendClinicalReviewerVerificationEmail(
      {
        email: 'reviewer@test.invalid',
        name: 'Reviewer',
        assignedReviewsUrl: 'https://web.test/clinical-review/assigned',
      },
      { send },
    )
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Ogun Clinical Review erişiminiz etkinleştirildi',
      }),
    )
  })
})
