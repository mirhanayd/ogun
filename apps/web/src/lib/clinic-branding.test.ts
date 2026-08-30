import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CLINIC_BRAND_COLOR,
  applyClinicBrandingVariables,
  contrastRatio,
  getClinicBrandingVariables,
  readableBrandForeground,
  resolveBrandColor,
} from './clinic-branding'

describe('clinic branding', () => {
  it('normalizes the canonical hex color and falls back for invalid values', () => {
    expect(resolveBrandColor('#A1B2C3')).toBe('#a1b2c3')
    expect(resolveBrandColor('red')).toBe(DEFAULT_CLINIC_BRAND_COLOR)
    expect(resolveBrandColor(null)).toBe(DEFAULT_CLINIC_BRAND_COLOR)
  })

  it('derives consistent web chrome tokens from one brand color', () => {
    const variables = getClinicBrandingVariables('#336699')

    expect(variables).toMatchObject({
      '--clinic-brand-color': '#336699',
      '--primary': '#336699',
      '--ring': '#336699',
      '--sidebar-primary': '#336699',
      '--clinic-brand-foreground': '#ffffff',
      '--primary-foreground': '#ffffff',
      '--sidebar-primary-foreground': '#ffffff',
    })
  })

  it.each(['#ffffff', '#f5d90a', '#777777', '#1b7a5a', '#112233', '#000000'])(
    'selects a WCAG AA readable foreground on %s',
    (background) => {
      const foreground = readableBrandForeground(background)
      expect(contrastRatio(background, foreground)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('selects foregrounds in the correct direction for light and dark colors', () => {
    expect(readableBrandForeground('#ffffff')).toBe('#000000')
    expect(readableBrandForeground('#000000')).toBe('#ffffff')
  })

  it('updates the same DOM tokens when the live preview color changes', () => {
    const values = new Map<string, string>()
    const setProperty = vi.fn((property: string, value: string) => values.set(property, value))

    applyClinicBrandingVariables({ setProperty }, '#123456')
    expect(values.get('--clinic-brand-color')).toBe('#123456')

    applyClinicBrandingVariables({ setProperty }, '#fedcba')
    expect(values.get('--clinic-brand-color')).toBe('#fedcba')
    expect(values.get('--clinic-brand-foreground')).toBe('#000000')
  })

  it('connects the persisted clinic color from app layout to the desktop header', () => {
    const layout = readFileSync(new URL('../app/(app)/layout.tsx', import.meta.url), 'utf8')
    const titlebarView = readFileSync(
      new URL('../components/app-shell-views.tsx', import.meta.url),
      'utf8',
    )
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

    expect(layout).toContain('getClinicBrandingVariables(clinic?.primaryColor)')
    expect(titlebarView).toContain('clinic-desktop-titlebar')
    expect(css).toContain('var(--clinic-brand-color, var(--desktop-chrome))')
    expect(css).toContain('var(--clinic-brand-foreground, white)')
  })

  it('keeps desktop color transitions and reduced-motion support', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

    expect(css).toMatch(/color 200ms ease-in-out/)
    expect(css).toMatch(/background-color 200ms ease-in-out/)
    expect(css).toMatch(/border-color 200ms ease-in-out/)
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
