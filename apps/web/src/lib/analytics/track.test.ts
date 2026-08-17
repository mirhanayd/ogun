import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDurationTracker, trackEvent, type TrackEventPayload } from './track'

// GitHub issue #47 / Prompt 8.3, GÖREV 2 — "ÖNEMLİ: analitik aracına sağlık
// verisi göndermeyin, sadece olay adları". #45'in pii-scrub testlerindeki
// AYNI titizlik burada da: bu test SADECE trackEvent'in ne GÖNDERDİĞİNİ
// (payload şeklini) doğrulamıyor, aynı zamanda TypeScript'in DERLEME
// ZAMANINDA sağlık-verisi-şekilli bir alanı (ör. clientName, allergies,
// weightKg) REDDETTİĞİNİ de belgeliyor (bkz. en alttaki tip testi).
describe('trackEvent', () => {
  let sendBeaconMock: ReturnType<typeof vi.fn>
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // trackEvent 'typeof window === undefined' iken (SSR) SESSİZCE çıkar —
    // vitest.config.ts environment: 'node' kullandığı için (jsdom bağımlılığı
    // eklemeden) window'u burada taklit ediyoruz, trackEvent'in KENDİSİ
    // window'un içeriğine hiç dokunmuyor, sadece varlığını kontrol ediyor.
    vi.stubGlobal('window', {})
    sendBeaconMock = vi.fn().mockReturnValue(true)
    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      value: sendBeaconMock,
      configurable: true,
    })
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sendBeacon üzerinden /api/analytics/event\'e SADECE eventName/screen/durationMs gönderir', () => {
    trackEvent({ eventName: 'plan_created', screen: '/danisanlar/[id]/planlar', durationMs: 4200 })

    expect(sendBeaconMock).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeaconMock.mock.calls[0] as [string, Blob]
    expect(url).toBe('/api/analytics/event')
    expect(blob).toBeInstanceOf(Blob)
  })

  it('gönderilen payload sağlık verisi/danışan kimliği ŞEKLİNDE bir alan İÇERMEZ', async () => {
    const payload: TrackEventPayload = { eventName: 'plan_created', screen: '/x', durationMs: 100 }
    trackEvent(payload)

    const [, blob] = sendBeaconMock.mock.calls[0] as [string, Blob]
    const text = await blob.text()
    const parsed = JSON.parse(text) as Record<string, unknown>

    expect(Object.keys(parsed).sort()).toEqual(['durationMs', 'eventName', 'screen'])
    // Sağlık verisiyle/danışan kimliğiyle ilişkilendirilebilecek HERHANGİ
    // bir anahtarın (bkz. pii-scrub.ts SENSITIVE_FIELD_NAMES ile AYNI ruh)
    // payload'da bulunmadığını doğrula.
    const forbiddenKeys = ['clientId', 'clientName', 'firstName', 'lastName', 'weight', 'weightKg', 'allergies', 'notes']
    for (const key of forbiddenKeys) {
      expect(parsed).not.toHaveProperty(key)
    }
  })

  it('sendBeacon yoksa/başarısız olursa fetch\'e (keepalive ile) düşer', () => {
    // @ts-expect-error — testte KASITLI olarak sendBeacon'u KALDIRIYORUZ
    // (value: undefined DEĞİL — 'sendBeacon' in navigator hâlâ true dönerdi).
    delete globalThis.navigator.sendBeacon
    trackEvent({ eventName: 'screen_view', screen: '/panel' })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/analytics/event',
      expect.objectContaining({ method: 'POST', keepalive: true }),
    )
  })
})

describe('createDurationTracker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('finish() çağrıldığında geçen süreyi (ms) durationMs olarak gönderir', async () => {
    vi.stubGlobal('window', {})
    const sendBeaconMock = vi.fn().mockReturnValue(true)
    Object.defineProperty(globalThis.navigator, 'sendBeacon', { value: sendBeaconMock, configurable: true })

    const tracker = createDurationTracker()
    await new Promise((resolve) => setTimeout(resolve, 5))
    tracker.finish('plan_created', '/planlar')

    const [, blob] = sendBeaconMock.mock.calls[0] as [string, Blob]
    const parsed = JSON.parse(await blob.text()) as { durationMs: number }
    expect(parsed.durationMs).toBeGreaterThanOrEqual(0)
  })
})

// TİP SEVİYESİNDE doğrulama — bu blok HİÇBİR ZAMAN çalıştırılmaz (it.skip),
// sadece `tsc --noEmit` sırasında derlenir. Amaç: TrackEventPayload'a
// sağlık-verisi-şekilli bir alan eklemenin DERLEME HATASI vermesi.
it.skip('[tip testi] TrackEventPayload serbest/ek alan kabul etmez', () => {
  // @ts-expect-error — 'clientName' TrackEventPayload'ın parçası DEĞİL.
  const invalid: TrackEventPayload = { eventName: 'plan_created', clientName: 'Ayşe Yılmaz' }
  void invalid
})
