import { describe, expect, it } from 'vitest'
import {
  getSentryEnvironment,
  isSentryEnabled,
  scrubSentryEvent,
  type MinimalSentryEvent,
} from './sentry'

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — @sentry/nextjs'in gerçek Event
// tipi/SDK'sı BİLEREK import EDİLMİYOR (bkz. sentry.ts dosya başı notu):
// bu test, sadece bizim beforeSend'e verdiğimiz scrubSentryEvent
// fonksiyonunun örnek bir Sentry event PAYLOAD'ı üzerinde gerçekten PII/
// sağlık verisini kırptığını doğruluyor — DSN/ağ/gerçek SDK'ya bağımlı değil.

describe('scrubSentryEvent', () => {
  it("örnek bir hata event'indeki danışan/sağlık verisi şekilli alanları kırpar", () => {
    const event: MinimalSentryEvent = {
      message: 'Plan kaydı sırasında hata: ayse.yilmaz@example.com için hesaplama başarısız',
      user: {
        id: 'user_42',
        email: 'diyetisyen@klinik.com',
        ip_address: '85.34.12.9',
      },
      request: {
        url: 'https://app.ogun.co/api/foods/search?q=fıstık',
        headers: {
          cookie: 'better-auth.session=abcdef',
          authorization: 'Bearer secret-token',
          'user-agent': 'Mozilla/5.0',
        },
        data: {
          client: {
            firstName: 'Ayşe',
            lastName: 'Yılmaz',
            phone: '05321234567',
          },
          measurement: { weightKg: '72.5', notes: 'hızlı kilo kaybı şikayeti' },
        },
      },
      extra: {
        clientNotes: 'Tip 2 diyabet tanılı, glutensiz beslenme planı isteniyor',
        requestId: 'req_123',
      },
      breadcrumbs: [
        {
          message: 'Danışan Mehmet Demir (0532 555 66 77) için ölçüm kaydedildi',
          data: { allergies: ['fındık'], clinicId: 'clinic_9' },
        },
      ],
      exception: {
        values: [{ value: 'TypeError: Cannot read weightKg of client ahmet.can@example.com' }],
      },
      tags: { environment: 'production' },
    }

    const scrubbed = scrubSentryEvent(event)

    // Mesaj içindeki e-posta kırpılmalı.
    expect(scrubbed.message).not.toContain('ayse.yilmaz@example.com')
    expect(scrubbed.message).toContain('[REDACTED_EMAIL]')

    // Kullanıcı objesinden sadece id kalmalı.
    expect(scrubbed.user).toEqual({ id: 'user_42' })

    // Request: cookie/authorization kırpılmalı, user-agent gibi zararsız
    // başlıklar kalmalı; data içindeki client/measurement alanları kırpılmalı.
    expect(scrubbed.request?.headers?.cookie).toBe('[REDACTED]')
    expect(scrubbed.request?.headers?.authorization).toBe('[REDACTED]')
    expect(scrubbed.request?.headers?.['user-agent']).toBe('Mozilla/5.0')
    expect(scrubbed.request?.cookies).toBeUndefined()
    const requestData = scrubbed.request?.data as {
      client: { firstName: unknown; lastName: unknown; phone: unknown }
      measurement: { weightKg: unknown; notes: unknown }
    }
    expect(requestData.client.firstName).toBe('[REDACTED]')
    expect(requestData.client.lastName).toBe('[REDACTED]')
    expect(requestData.client.phone).toBe('[REDACTED]')
    expect(requestData.measurement.weightKg).toBe('[REDACTED]')
    expect(requestData.measurement.notes).toBe('[REDACTED]')

    // extra içindeki sağlık verisi kırpılmalı, requestId gibi zararsız
    // teknik alanlar kalmalı.
    expect(scrubbed.extra?.clientNotes).toBe('[REDACTED]')
    expect(scrubbed.extra?.requestId).toBe('req_123')

    // Breadcrumb mesajındaki isim/telefon kırpılmalı, data.allergies
    // anahtar-tabanlı kırpılmalı, clinicId kalmalı.
    const crumb = scrubbed.breadcrumbs?.[0]
    expect(crumb?.message).not.toContain('0532 555 66 77')
    expect(crumb?.data?.allergies).toBe('[REDACTED]')
    expect(crumb?.data?.clinicId).toBe('clinic_9')

    // Exception mesajındaki e-posta kırpılmalı.
    expect(scrubbed.exception?.values?.[0]?.value).not.toContain('ahmet.can@example.com')
    expect(scrubbed.exception?.values?.[0]?.value).toContain('[REDACTED_EMAIL]')

    // Sentry'nin kendi meta alanlarına (tags) dokunulmamalı.
    expect(scrubbed.tags).toEqual({ environment: 'production' })
  })

  it("alanı olmayan minimal bir event'te hata vermez", () => {
    expect(() => scrubSentryEvent({})).not.toThrow()
  })

  it('request URL içindeki tek kullanımlık klinik davet tokenını kırpar', () => {
    const token = 'secret-invitation-token_123'
    const scrubbed = scrubSentryEvent({
      request: { url: `https://app.ogun.co/davet/${token}?source=email` },
    })

    expect(scrubbed.request?.url).toBe('https://app.ogun.co/davet/[REDACTED]?source=email')
    expect(scrubbed.request?.url).not.toContain(token)
  })
})

describe('isSentryEnabled / getSentryEnvironment', () => {
  it('SENTRY_DSN ve NEXT_PUBLIC_SENTRY_DSN tanımlı değilken false döner', () => {
    const original = { dsn: process.env.SENTRY_DSN, publicDsn: process.env.NEXT_PUBLIC_SENTRY_DSN }
    delete process.env.SENTRY_DSN
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
    expect(isSentryEnabled()).toBe(false)
    if (original.dsn) process.env.SENTRY_DSN = original.dsn
    if (original.publicDsn) process.env.NEXT_PUBLIC_SENTRY_DSN = original.publicDsn
  })

  it('SENTRY_DSN tanımlıyken true döner', () => {
    const original = process.env.SENTRY_DSN
    process.env.SENTRY_DSN = 'https://example@o0.ingest.de.sentry.io/1'
    expect(isSentryEnabled()).toBe(true)
    if (original === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = original
  })

  it('ortam bilgisi olarak bir string döner', () => {
    expect(typeof getSentryEnvironment()).toBe('string')
  })
})
