export interface HeaderEntry {
  key: string
  value: string
}

export function buildContentSecurityPolicy(env?: Record<string, string | undefined>): string
export function buildSecurityHeaders(env?: Record<string, string | undefined>): HeaderEntry[]
