import type { NextConfig } from 'next'
import { buildSecurityHeaders } from '../../scripts/security-headers.mjs'

const nextConfig: NextConfig = {
  experimental: { authInterrupts: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          ...buildSecurityHeaders(process.env),
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default nextConfig
