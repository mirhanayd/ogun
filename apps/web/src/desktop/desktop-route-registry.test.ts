import { describe, expect, it } from 'vitest'
import { resolveDesktopRoute, unresolvedVisibleRoutes } from './desktop-route-registry'
import { readFileSync } from 'node:fs'

describe('desktop route registry', () => {
  it.each(['owner', 'dietitian', 'assistant'] as const)('resolves every route visible to %s', (role) => {
    expect(unresolvedVisibleRoutes(role)).toEqual([])
  })

  it('resolves parameterized and query-string routes without a catch-all loading state', () => {
    expect(resolveDesktopRoute('/danisanlar/yeni')).toEqual({ kind: 'client_new' })
    expect(resolveDesktopRoute('/danisanlar/client-1')).toEqual({ kind: 'client_detail', clientId: 'client-1' })
    expect(resolveDesktopRoute('/danisanlar/client-1/planlar/plan-1')).toEqual({ kind: 'plan_editor', clientId: 'client-1', planId: 'plan-1' })
    expect(resolveDesktopRoute('/finans?month=2026-08')).toEqual({ kind: 'finance', month: '2026-08' })
    expect(resolveDesktopRoute('/ayarlar/ekip')).toEqual({ kind: 'settings_team' })
    expect(resolveDesktopRoute('/bilinmeyen')).toEqual({ kind: 'not_found' })
  })

  it('enumerates every SettingsScreen internal href and resolves a distinct product route', () => {
    const source = readFileSync(new URL('../screens/settings-screen.tsx', import.meta.url), 'utf8')
    const hrefs = [...source.matchAll(/href="(\/[^"]+)"/g)].map((match) => match[1]!)
    const expected = {
      '/ayarlar': 'settings', '/ayarlar/ekip': 'settings_team',
      '/ayarlar/hatirlatmalar': 'settings_reminders', '/ayarlar/paylasim': 'settings_sharing',
      '/ayarlar/veri-guvenligi': 'settings_security', '/ayarlar/abonelik': 'settings_subscription',
    }
    expect(hrefs.length).toBeGreaterThanOrEqual(4)
    for (const href of hrefs) expect(resolveDesktopRoute(href).kind).toBe(expected[href as keyof typeof expected])
    expect(new Set(Object.keys(expected).map((href) => resolveDesktopRoute(href).kind)).size).toBe(6)
    expect(resolveDesktopRoute('/ayarlar/bilinmeyen')).toEqual({ kind: 'not_found' })
    const adapter = readFileSync(new URL('./local-settings-adapter.tsx', import.meta.url), 'utf8')
    for (const [kind, screen] of Object.entries({ settings_team: 'TeamSettingsView', settings_reminders: 'ReminderSettingsView', settings_sharing: 'SharingSettingsView', settings_security: 'SecuritySettingsView', settings_subscription: 'SubscriptionSettingsView' })) {
      expect(adapter).toContain(`routeKind === '${kind}' ? <${screen}`)
    }
  })
})
