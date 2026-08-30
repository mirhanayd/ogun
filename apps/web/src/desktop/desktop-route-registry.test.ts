import { describe, expect, it } from 'vitest'
import { resolveDesktopRoute, unresolvedVisibleRoutes } from './desktop-route-registry'

describe('desktop route registry', () => {
  it.each(['owner', 'dietitian', 'assistant'] as const)('resolves every route visible to %s', (role) => {
    expect(unresolvedVisibleRoutes(role)).toEqual([])
  })

  it('resolves parameterized and query-string routes without a catch-all loading state', () => {
    expect(resolveDesktopRoute('/danisanlar/yeni')).toEqual({ kind: 'client_new' })
    expect(resolveDesktopRoute('/danisanlar/client-1')).toEqual({ kind: 'client_detail', clientId: 'client-1' })
    expect(resolveDesktopRoute('/danisanlar/client-1/planlar/plan-1')).toEqual({ kind: 'plan_editor', clientId: 'client-1', planId: 'plan-1' })
    expect(resolveDesktopRoute('/finans?month=2026-08')).toEqual({ kind: 'finance', month: '2026-08' })
    expect(resolveDesktopRoute('/ayarlar/ekip')).toEqual({ kind: 'settings' })
    expect(resolveDesktopRoute('/bilinmeyen')).toEqual({ kind: 'not_found' })
  })
})
