// GitHub issue #45 / Prompt 8.1, GÖREV 1 — "Sentry (EU bölgesi) kurulumu,
// kaynak haritaları. Sağlık verisi loglara SIZMASIN — PII filtreleme
// kuralları yaz."
//
// BAĞLAM (ortam kısıtı): bu sandbox'ta gerçek bir Sentry hesabı/DSN yok.
// packages/*'te tekrar tekrar kullanılan desenle AYNI yaklaşım burada da
// uygulanıyor (bkz. lib/sms/index.ts, lib/invoicing/index.ts, lib/subscription/
// payment-provider — "değiştirilebilir arayüz, gerçek kimlik bilgisi pilot
// sonrası doğrulanır"): entegrasyon kodu TAM ve DOĞRU yazılıyor, ama
// SENTRY_DSN ortam değişkeni YOKSA (bu sandbox'ta böyle) init() sessizce
// no-op olur — uygulama Sentry OLMADAN da normal çalışır, hata fırlatmaz.
//
// EU bölgesi: Sentry projesi oluşturulurken "Data Storage Location: EU"
// seçilmeli (SaaS tarafı, kod tarafında ayrı bir bölge parametresi yok —
// DSN'in host kısmı zaten seçilen bölgenin ingest sunucusunu gösterir, ör.
// https://xxxx@o0.ingest.de.sentry.io/... "de.sentry.io" AB bölgesidir).
// .env.example'daki SENTRY_DSN açıklaması bunu hatırlatıyor.
import { scrubValue, scrubPiiFromText, REDACTED_VALUE } from './pii-scrub'

// @sentry/nextjs'in tam Event tipini import ETMİYORUZ (bu dosyanın
// pii-scrub.ts ile birlikte @sentry/nextjs KURULU OLMASA bile
// test/typecheck edilebilmesini istiyoruz — bkz. sentry.test.ts, orada
// gerçek SDK hiç import edilmiyor). Bunun yerine beforeSend'in ihtiyaç
// duyduğu ALANLARIN minimal, yapısal bir alt kümesini tanımlıyoruz;
// @sentry/nextjs'in gerçek Event tipi yapısal olarak bunu karşılar (fazladan
// alanlar sorun değil), sentry.server.config.ts/instrumentation-client.ts
// içinde `as unknown as Sentry.Event` ile GEÇİCİ bir köprü kullanılıyor.
export interface MinimalSentryUser {
  id?: string
  email?: string
  username?: string
  ip_address?: string
  [key: string]: unknown
}

export interface MinimalSentryRequest {
  url?: string
  headers?: Record<string, string>
  data?: unknown
  cookies?: Record<string, string>
  [key: string]: unknown
}

export interface MinimalSentryBreadcrumb {
  message?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface MinimalSentryExceptionValue {
  value?: string
  [key: string]: unknown
}

export interface MinimalSentryEvent {
  message?: string
  user?: MinimalSentryUser
  request?: MinimalSentryRequest
  extra?: Record<string, unknown>
  contexts?: Record<string, unknown>
  breadcrumbs?: MinimalSentryBreadcrumb[]
  exception?: { values?: MinimalSentryExceptionValue[] }
  tags?: Record<string, unknown>
  [key: string]: unknown
}

const SENSITIVE_HEADER_NAMES = new Set(['cookie', 'authorization', 'x-auth-token', 'set-cookie'])

function scrubHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return headers
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADER_NAMES.has(key.toLowerCase()) ? REDACTED_VALUE : scrubPiiFromText(value)
  }
  return result
}

// Sentry init'ine `beforeSend` olarak verilecek fonksiyon. Event, Sentry'nin
// kendisine gitmeden HEMEN ÖNCE (ağa hiç çıkmadan) burada kırpılır — event'in
// gönderilip gönderilmeyeceğine bu fonksiyon karar verir DEĞİL (her zaman
// event döner, event'i BASTIRMAK istemiyoruz), sadece İÇERİĞİNİ temizler.
//
// Kapsam BİLEREK dar tutuldu: request.cookies/headers, user PII alanları,
// extra/contexts/breadcrumbs/exception (hepsi scrubValue ile ANAHTAR
// tabanlı kırpılır, bkz. pii-scrub.ts), message/exception.value (İÇERİK
// tabanlı kırpılır — scrubPiiFromText). tags/fingerprint/level/event_id gibi
// Sentry'nin kendi meta alanlarına DOKUNULMAZ, aksi halde hata gruplama ve
// arama işlevselliği bozulur.
export function scrubSentryEvent<T extends MinimalSentryEvent>(event: T): T {
  const scrubbed: MinimalSentryEvent = { ...event }

  if (scrubbed.message) {
    scrubbed.message = scrubPiiFromText(scrubbed.message)
  }

  if (scrubbed.user) {
    scrubbed.user = {
      // Sadece dahili kullanıcı id'si kalır — Sentry varsayılan olarak
      // (sendDefaultPii açıksa) email/ip_address da toplar, bunlar burada
      // KASITLI OLARAK atılıyor (danışan verisi değil ama yine de PII).
      id: scrubbed.user.id,
    }
  }

  if (scrubbed.request) {
    scrubbed.request = {
      ...scrubbed.request,
      headers: scrubHeaders(scrubbed.request.headers),
      cookies: undefined, // cookie DEĞERLERİ hiçbir koşulda tutulmaz.
      data: scrubbed.request.data === undefined ? undefined : scrubValue(scrubbed.request.data, undefined),
    }
  }

  if (scrubbed.extra) {
    scrubbed.extra = scrubValue(scrubbed.extra, undefined) as Record<string, unknown>
  }

  if (scrubbed.contexts) {
    scrubbed.contexts = scrubValue(scrubbed.contexts, undefined) as Record<string, unknown>
  }

  if (scrubbed.breadcrumbs) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: crumb.message ? scrubPiiFromText(crumb.message) : crumb.message,
      data: crumb.data ? (scrubValue(crumb.data, undefined) as Record<string, unknown>) : crumb.data,
    }))
  }

  if (scrubbed.exception?.values) {
    scrubbed.exception = {
      values: scrubbed.exception.values.map((v) => ({
        ...v,
        value: v.value ? scrubPiiFromText(v.value) : v.value,
      })),
    }
  }

  return scrubbed as T
}

// SENTRY_DSN yoksa Sentry'yi HİÇ init etmiyoruz — bu, "swappable interface,
// gerçek kimlik bilgisi pilot sonrası" desenindeki no-op şubesi. Sentry
// SDK'sının init() fonksiyonu dsn:undefined ile çağrılsa da teknik olarak
// no-op olur, ama biz bunu AÇIKÇA bir fonksiyona çıkarıyoruz ki init
// çağrılarının kendisi de (instrumentation.ts, instrumentation-client.ts)
// "DSN yoksa hiç yükleme/init yapma" diye erken dönebilsin — gereksiz SDK
// başlatma maliyetinden (network idle bağlantısı vb.) kaçınmak için.
export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
}

export function getSentryEnvironment(): string {
  return process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development'
}
