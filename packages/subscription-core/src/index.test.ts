import { describe, expect, it } from 'vitest'
import {
  PLAN_DEFINITIONS,
  assertManualStatusTransition,
  detectSubscriptionDrift,
  getPlanLimitViolations,
  getPlanPriceLabel,
} from './index'

const now = new Date('2026-09-10T12:00:00Z')

describe('subscription policy', () => {
  it('preserves canonical plans and renders enterprise as custom pricing', () => {
    expect(Object.keys(PLAN_DEFINITIONS)).toEqual(['başlangıç', 'klinik', 'kurumsal'])
    expect(getPlanPriceLabel('kurumsal', 'monthly')).toBe('Özel fiyatlandırma')
  })

  it('detects deterministic drift without Date.now', () => {
    expect(
      detectSubscriptionDrift({
        clinicStatus: 'active',
        trialEndsAt: null,
        subscription: null,
        now,
      }).map((item) => item.code),
    ).toEqual(['active_without_subscription'])
    expect(
      detectSubscriptionDrift({
        clinicStatus: 'trialing',
        trialEndsAt: new Date('2026-09-09T00:00:00Z'),
        subscription: null,
        now,
      }).map((item) => item.code),
    ).toEqual(['expired_trial'])
    expect(
      detectSubscriptionDrift({
        clinicStatus: 'active',
        trialEndsAt: null,
        subscription: {
          provider: 'iyzico',
          providerSubscriptionId: 'provider-ref',
          cancelAtPeriodEnd: true,
          currentPeriodEnd: new Date('2026-09-09T00:00:00Z'),
        },
        now,
      }).map((item) => item.code),
    ).toEqual(['expired_cancel_pending'])
  })

  it('accepts consistent active and trial states', () => {
    expect(
      detectSubscriptionDrift({
        clinicStatus: 'trialing',
        trialEndsAt: new Date('2026-09-20T00:00:00Z'),
        subscription: null,
        now,
      }),
    ).toEqual([])
    expect(
      detectSubscriptionDrift({
        clinicStatus: 'active',
        trialEndsAt: null,
        subscription: {
          provider: 'iyzico',
          providerSubscriptionId: 'provider-ref',
          cancelAtPeriodEnd: false,
          currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
        },
        now,
      }),
    ).toEqual([])
  })

  it('blocks over-limit downgrades and invalid manual transitions', () => {
    expect(getPlanLimitViolations('başlangıç', { activeClients: 61, activeUsers: 4 })).toEqual([
      '61 aktif danışan / limit 60',
      '4 aktif kullanıcı / limit 1',
    ])
    expect(() => assertManualStatusTransition('active', 'trialing')).toThrow()
    expect(() => assertManualStatusTransition('past_due', 'active')).not.toThrow()
  })
})
