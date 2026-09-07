import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DesktopLogin } from './desktop-app'

describe('unified desktop login presentation', () => {
  for (const saved of [false, true]) {
    it(`renders email and password with ${saved ? 'a saved profile' : 'no profiles'}`, () => {
      const html = renderToStaticMarkup(createElement(DesktopLogin, {
        profiles: saved ? [{ userId: 'test', clinicId: 'clinic', displayName: 'Test user', email: 'test@ogun.test', clinicName: 'Test clinic', role: 'owner', pinConfigured: true, lastSyncedAt: null }] : [],
        onAuthenticated: () => undefined,
      }))
      expect(html).toContain('id="desktop-email"')
      expect(html).toContain('id="desktop-password"')
      expect(html).toContain('type="submit"')
      expect(html.includes('Bu cihazdaki kayıtlı hesaplar')).toBe(saved)
    })
  }
})
