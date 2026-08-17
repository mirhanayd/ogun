import * as Sentry from '@sentry/nextjs'
import { getSentryEnvironment, isSentryEnabled, scrubSentryEvent, type MinimalSentryEvent } from './sentry'

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — Edge runtime tarafı Sentry init'i
// (middleware / edge route'lar için). sentry-server.ts ile AYNI scrub
// mantığı, tekrarını azaltmak için pii-scrub.ts + sentry.ts'e devrediliyor.
if (isSentryEnabled()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: getSentryEnvironment(),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event as unknown as MinimalSentryEvent) as unknown as typeof event
    },
  })
}
