import { describe, expect, it } from 'vitest'
import { ADMIN_SUPPORT_TRANSITIONS, canAdminTransitionSupportTicket, canClinicReopenSupportTicket, SUPPORT_STATUSES } from './support-domain'

describe('support ticket state machine', () => {
  it('keeps every canonical status in one transition graph', () => {
    expect(Object.keys(ADMIN_SUPPORT_TRANSITIONS).sort()).toEqual([...SUPPORT_STATUSES].sort())
  })

  it.each(SUPPORT_STATUSES.flatMap((from) => ADMIN_SUPPORT_TRANSITIONS[from].map((to) => [from, to] as const)))('%s → %s geçişine izin verir', (from, to) => {
    expect(canAdminTransitionSupportTicket(from, to)).toBe(true)
  })

  it.each([
    ['closed', 'in_progress'], ['closed', 'resolved'], ['submitted', 'closed'],
    ['triaged', 'reopened'], ['resolved', 'in_progress'], ['waiting_for_clinic', 'closed'],
  ] as const)('%s → %s geçişini reddeder', (from, to) => {
    expect(canAdminTransitionSupportTicket(from, to)).toBe(false)
  })

  it('clinic reopen kuralını adminden ayrı tutar', () => {
    expect(canClinicReopenSupportTicket('resolved')).toBe(true)
    expect(canClinicReopenSupportTicket('closed')).toBe(false)
    expect(canClinicReopenSupportTicket('in_progress')).toBe(false)
  })
})
