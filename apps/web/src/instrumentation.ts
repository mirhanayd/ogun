import type { Instrumentation } from 'next'
import { isSentryEnabled } from './lib/monitoring/sentry'

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — Next.js'in KENDİ "Instrumentation"
// hook'u (register/onRequestError). BİLEREK Vercel'e özel bir mekanizma
// DEĞİL: bu dosya, standart bir `next start` (Docker/plain Node) ortamında da
// AYNI şekilde çalışır — Vercel sadece bunu otomatik keşfeder, başka hiçbir
// platform bunu "kapatmaz". next.config.ts'te ek bir bayrak GEREKMİYOR
// (Next.js 15'te instrumentation hook'u stabil ve varsayılan olarak açık).
//
// SENTRY_DSN yoksa (bu sandbox'ta böyle) hem register() hem onRequestError
// NO-OP kalır — bkz. lib/monitoring/sentry.ts isSentryEnabled() dosya başı
// notu.
export async function register(): Promise<void> {
  if (!isSentryEnabled()) return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/monitoring/sentry-server')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./lib/monitoring/sentry-edge')
  }
}

// Next.js, App Router'da yakalanan (render sırasında oluşan) sunucu
// hatalarını bu hook'a iletir — Sentry.captureRequestError zaten kendi
// içinde event'i beforeSend'den geçirir (sentry-server.ts/sentry-edge.ts'te
// tanımlı init'ten), yani PII scrub burada AYRICA uygulanmaz, tek bir
// yerden (init'teki beforeSend) geçer.
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!isSentryEnabled()) return
  const Sentry = await import('@sentry/nextjs')
  await Sentry.captureRequestError(...args)
}
