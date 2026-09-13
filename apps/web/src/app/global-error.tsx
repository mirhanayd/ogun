'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

/**
 * Root layout render failures bypass ordinary route error boundaries. This
 * boundary keeps that last-resort surface observable without rendering error
 * details or user data. The client Sentry initializer applies the shared PII
 * scrubber before an event leaves the browser.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="tr">
      <body>
        <main style={{ margin: '4rem auto', maxWidth: '36rem', padding: '0 1.5rem', fontFamily: 'sans-serif' }}>
          <h1>Uygulama yüklenemedi</h1>
          <p>Beklenmeyen bir sorun oluştu. Lütfen sayfayı yenileyin; sorun sürerse daha sonra tekrar deneyin.</p>
        </main>
      </body>
    </html>
  )
}
