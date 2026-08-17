import * as Sentry from '@sentry/nextjs'
import { getSentryEnvironment, isSentryEnabled, scrubSentryEvent, type MinimalSentryEvent } from './lib/monitoring/sentry'

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — Tarayıcı (client) tarafı Sentry
// init'i. Next.js 15.3+'ta `instrumentation-client.ts` (bu dosya, src/
// altında) otomatik olarak build'e dahil edilir — ayrı bir
// `sentry.client.config.ts` + next.config.ts'te manuel import GEREKMEZ, bu
// eski (deprecated) desendir. NEXT_PUBLIC_SENTRY_DSN yoksa init hiç
// çağrılmaz (bkz. isSentryEnabled).
if (isSentryEnabled()) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: getSentryEnvironment(),
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event as unknown as MinimalSentryEvent) as unknown as typeof event
    },
  })
}

// NOT: @sentry/nextjs'in bazı sürümlerinde (9.x) Next.js App Router istemci
// taraflı gezinme (navigation) izlemesi için `captureRouterTransitionStart`
// adlı bir export burada tanımlanabilir. Bu proje BİLİNÇLİ OLARAK @sentry/
// nextjs 8.x'e SABİTLENDİ (bkz. package.json'daki not) — 9.x'in @sentry/node
// paketi, OpenTelemetry tabanlı otomatik enstrümantasyonu (fastify/kafka/knex
// gibi bu projede HİÇ kullanılmayan onlarca entegrasyonu KOŞULSUZ require()
// ediyor) Next.js 15 Turbopack'in geliştirme derlemesiyle (bkz.
// apps/web/instrumentation.ts derlemesi) "Module not found: @sentry/node-core"
// hatasıyla ÇAKIŞIYOR — bu, Sentry SDK'sının kendi bilinen bir Turbopack
// uyumsuzluğu (sentry-javascript GitHub deposunda birden fazla açık issue).
// 8.x bu OTel ayrışmasından ÖNCEKİ mimariyi kullanıyor, aynı çakışmayı
// YAŞAMIYOR. captureRouterTransitionStart export'u bu yüzden BURADA YOK.
