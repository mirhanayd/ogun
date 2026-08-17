import { describe, expect, it } from 'vitest'
import { REDACTED_VALUE, scrubPiiFromText, scrubRecord, scrubValue } from './pii-scrub'

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — "Sağlık verisi loglara SIZMASIN"
// hukuki/ürün gereksinimi için bu paketin TEK gerçek, doğrulanabilir test
// yükümlülüğü bu dosya. Örnekler UYDURULMADI — packages/db/src/schema/
// clients.ts, measurements.ts, health-records.ts'teki GERÇEK kolon
// adlarıyla, GERÇEKÇİ Türkçe örnek değerlerle kuruldu.

describe('scrubPiiFromText', () => {
  it('e-posta adreslerini kırpar', () => {
    const result = scrubPiiFromText('Danışan iletişim: ayse.yilmaz@example.com üzerinden ulaşılabilir.')
    expect(result).not.toContain('ayse.yilmaz@example.com')
    expect(result).toContain('[REDACTED_EMAIL]')
  })

  it('Türkiye telefon numaralarını (yaygın yazım biçimleriyle) kırpar', () => {
    const variants = ['0532 123 45 67', '+90 532 123 45 67', '05321234567', '532-123-45-67']
    for (const phone of variants) {
      const result = scrubPiiFromText(`Danışanı ${phone} numarasından arayın.`)
      expect(result, `variant: ${phone}`).not.toContain(phone)
      expect(result, `variant: ${phone}`).toContain('[REDACTED_PHONE]')
    }
  })

  it('TC kimlik no görünümündeki 11 haneli sayıları kırpar', () => {
    const result = scrubPiiFromText('Kimlik no: 12345678901 ile kayıt bulundu.')
    expect(result).not.toContain('12345678901')
    expect(result).toContain('[REDACTED_ID]')
  })

  it('hassas kalıp içermeyen metne dokunmaz', () => {
    const text = 'Plan hesaplama sırasında beklenmeyen bir hata oluştu (kod: 500).'
    expect(scrubPiiFromText(text)).toBe(text)
  })
})

describe('scrubValue — anahtar tabanlı kırpma', () => {
  it('clients tablosundaki demografik/iletişim alanlarını kırpar', () => {
    const client = {
      id: 'client_123', // hassas DEĞİL — kırpılmamalı
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phone: '05321234567',
      email: 'ayse@example.com',
      birthDate: '1990-05-12',
      occupation: 'Öğretmen',
      notes: 'Gluten hassasiyeti var, dikkatli olunmalı.',
    }
    const result = scrubRecord(client)
    expect(result.id).toBe('client_123')
    expect(result.firstName).toBe(REDACTED_VALUE)
    expect(result.lastName).toBe(REDACTED_VALUE)
    expect(result.phone).toBe(REDACTED_VALUE)
    expect(result.email).toBe(REDACTED_VALUE)
    expect(result.birthDate).toBe(REDACTED_VALUE)
    expect(result.occupation).toBe(REDACTED_VALUE)
    expect(result.notes).toBe(REDACTED_VALUE)
  })

  it('clientHealth (anamnez) alanlarını — diziler dahil — tamamen kırpar', () => {
    const health = {
      clientId: 'client_123',
      conditions: ['Tip 2 diyabet', 'Hipertansiyon'],
      medications: ['Metformin 500mg'],
      allergies: [{ id: 'a1', label: 'yer fıstığı', normalized: 'yer findigi', severity: 'şiddetli', note: null }],
      smokingStatus: 'Sigara kullanmıyor',
      sleepHours: 6,
    }
    const result = scrubValue(health, undefined) as Record<string, unknown>
    expect(result.clientId).toBe('client_123')
    expect(result.conditions).toBe(REDACTED_VALUE)
    expect(result.medications).toBe(REDACTED_VALUE)
    expect(result.allergies).toBe(REDACTED_VALUE)
    expect(result.smokingStatus).toBe(REDACTED_VALUE)
    expect(result.sleepHours).toBe(REDACTED_VALUE)
  })

  it('measurements tablosundaki ölçüm alanlarını kırpar', () => {
    const measurement = {
      id: 'm_1',
      clientId: 'client_123',
      weightKg: '72.500',
      heightCm: '168.00',
      bodyFatPct: '24.100',
      notes: 'Danışan son 2 haftada 1.5 kg verdi.',
    }
    const result = scrubRecord(measurement)
    expect(result.id).toBe('m_1')
    expect(result.clientId).toBe('client_123')
    expect(result.weightKg).toBe(REDACTED_VALUE)
    expect(result.heightCm).toBe(REDACTED_VALUE)
    expect(result.bodyFatPct).toBe(REDACTED_VALUE)
    expect(result.notes).toBe(REDACTED_VALUE)
  })

  it('lab_results (laboratuvar) alanlarını kırpar', () => {
    const lab = {
      id: 'lab_1',
      clientId: 'client_123',
      analyte: 'HbA1c',
      value: '7.200',
      unit: '%',
      labName: 'Acıbadem Laboratuvarı',
    }
    const result = scrubRecord(lab)
    expect(result.id).toBe('lab_1')
    expect(result.analyte).toBe(REDACTED_VALUE)
    expect(result.labName).toBe(REDACTED_VALUE)
    // "value"/"unit" TEK BAŞINA kırpılmaz — bu iki anahtar adı proje genelinde
    // (form alanları, Sentry breadcrumb'ları vb.) o kadar yaygın/genel ki
    // anahtar bazlı kırpmaya dahil etmek çok sayıda ZARARSIZ alanı da
    // (ör. hedef kalori, dozaj birimi) gereksiz yere REDACTED yapardı. Asıl
    // bağlamsal koruma "analyte" (hangi tahlil) ve "labName" gibi kimliği
    // AÇIK EDEN alanlardan geliyor — value tek başına (hangi tahlile ait
    // olduğu bilinmeden) klinik olarak anlamsız bir sayı.
    expect(result.value).toBe('7.200')
    expect(result.unit).toBe('%')
  })

  it('kimlik doğrulama alanlarını (password, token, authorization, cookie) kırpar', () => {
    const authPayload = {
      password: 'gizli-sifre-123',
      token: 'eyJhbGciOi...',
      authorization: 'Bearer abc123',
      cookie: 'session=abc; Path=/',
      apiKey: 'sk_live_xxx',
    }
    const result = scrubRecord(authPayload)
    for (const key of Object.keys(authPayload)) {
      expect(result[key], key).toBe(REDACTED_VALUE)
    }
  })

  it('iç içe geçmiş (nested) objelerde de hassas alanları bulur', () => {
    const event = {
      request: {
        data: {
          client: { firstName: 'Mehmet', lastName: 'Demir' },
          note: 'ölçüm formu gönderildi',
        },
      },
    }
    const result = scrubRecord(event) as { request: { data: { client: { firstName: unknown; lastName: unknown }; note: unknown } } }
    expect(result.request.data.client.firstName).toBe(REDACTED_VALUE)
    expect(result.request.data.client.lastName).toBe(REDACTED_VALUE)
    // "note" da (plan_items.note, measurements.notes ile AYNI risk sınıfı —
    // serbest metin, sağlık verisi taşıyabilir) kırpılır.
    expect(result.request.data.note).toBe(REDACTED_VALUE)
  })

  it('bir dizi içindeki hassas objeleri de kırpar', () => {
    const clients = [
      { firstName: 'Ali', notes: 'çölyak hastası' },
      { firstName: 'Zeynep', notes: 'laktoz intoleransı' },
    ]
    const result = scrubValue(clients, undefined) as Array<{ firstName: unknown; notes: unknown }>
    for (const entry of result) {
      expect(entry.firstName).toBe(REDACTED_VALUE)
      expect(entry.notes).toBe(REDACTED_VALUE)
    }
  })

  it('hassas olmayan alanlara (id, status, createdAt, sayısal kimlikler) dokunmaz', () => {
    const safe = {
      id: 'plan_1',
      status: 'taslak',
      createdAt: '2026-08-17T10:00:00.000Z',
      targetKcal: 1800,
    }
    expect(scrubRecord(safe)).toEqual(safe)
  })

  it('null/undefined değerleri güvenle geçirir', () => {
    const record = { firstName: null, lastName: undefined, id: 'x' }
    const result = scrubRecord(record)
    expect(result.firstName).toBeNull()
    expect(result.lastName).toBeUndefined()
    expect(result.id).toBe('x')
  })
})
