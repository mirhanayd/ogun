import * as Sentry from '@sentry/nextjs'
import { getSentryEnvironment, isSentryEnabled, scrubSentryEvent, type MinimalSentryEvent } from './sentry'

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — Node.js runtime tarafı Sentry
// init'i. src/instrumentation.ts'in register() hook'u (Next.js'in KENDİ,
// Vercel'e özel OLMAYAN standart mekanizması — bkz. Next.js "Instrumentation"
// dokümanı, herhangi bir Node sunucusunda çalışır) tarafından
// NEXT_RUNTIME === 'nodejs' iken dinamik import edilir.
if (isSentryEnabled()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: getSentryEnvironment(),
    // Düşük örnekleme oranı — bu bir sağlık verisi platformu, performans
    // izleme (tracing) span'leri de request body/query param taşıyabilir;
    // beforeSendTransaction ile AYNI scrub'ı transaction event'lerine de
    // uyguluyoruz (aşağıda).
    tracesSampleRate: 0.1,
    // sendDefaultPii AÇIKÇA false — Sentry'nin varsayılan olarak IP adresi/
    // istek başlıkları toplamasını engeller (beforeSend zaten bunları
    // kırpıyor ama "varsayılan kapalı" ikinci bir güvenlik katmanı).
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event as unknown as MinimalSentryEvent) as unknown as typeof event
    },
    beforeSendTransaction(event) {
      return scrubSentryEvent(event as unknown as MinimalSentryEvent) as unknown as typeof event
    },
  })
}
