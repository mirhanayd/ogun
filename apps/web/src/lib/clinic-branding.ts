import type { CSSProperties } from 'react'

export const DEFAULT_CLINIC_BRAND_COLOR = '#1b7a5a'
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export function isValidBrandColor(value: string | null | undefined): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
}

export function resolveBrandColor(value: string | null | undefined): string {
  return isValidBrandColor(value) ? value.toLowerCase() : DEFAULT_CLINIC_BRAND_COLOR
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(hexColor: string): number {
  const color = resolveBrandColor(hexColor)
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  )
}

export function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

export function readableBrandForeground(
  background: string | null | undefined,
): '#ffffff' | '#111111' {
  const color = resolveBrandColor(background)
  return contrastRatio(color, '#ffffff') >= contrastRatio(color, '#111111') ? '#ffffff' : '#111111'
}

export type ClinicBrandingVariables = CSSProperties & Record<`--${string}`, string>

export function getClinicBrandingVariables(
  brandColor: string | null | undefined,
): ClinicBrandingVariables {
  const color = resolveBrandColor(brandColor)
  const foreground = readableBrandForeground(color)
  return {
    '--clinic-brand-color': color,
    '--clinic-brand-foreground': foreground,
    '--primary': color,
    '--primary-foreground': foreground,
    '--ring': color,
    '--sidebar-primary': color,
    '--sidebar-primary-foreground': foreground,
  }
}

export function applyClinicBrandingVariables(
  style: Pick<CSSStyleDeclaration, 'setProperty'>,
  brandColor: string | null | undefined,
): void {
  for (const [property, value] of Object.entries(getClinicBrandingVariables(brandColor))) {
    style.setProperty(property, String(value))
  }
}
