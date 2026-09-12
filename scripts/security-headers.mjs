function safeOrigin(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

export function buildContentSecurityPolicy(env = process.env) {
  const connections = new Set(["'self'", 'data:', 'https://*.iyzipay.com'])
  const images = new Set(["'self'", 'data:', 'blob:'])
  for (const value of [env.S3_ENDPOINT, env.SENTRY_DSN, env.NEXT_PUBLIC_SENTRY_DSN]) {
    const origin = safeOrigin(value)
    if (origin) connections.add(origin)
  }
  const storageOrigin = safeOrigin(env.S3_ENDPOINT)
  if (storageOrigin) images.add(storageOrigin)

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self' https://*.iyzipay.com",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://*.iyzipay.com",
    "style-src 'self' 'unsafe-inline' https://*.iyzipay.com",
    `img-src ${[...images].join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${[...connections].join(' ')}`,
    "frame-src 'self' https://*.iyzipay.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ')
}

export function buildSecurityHeaders(env = process.env) {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), browsing-topics=()',
    },
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(env) },
    ...(env.NODE_ENV === 'production'
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
      : []),
  ]
}
