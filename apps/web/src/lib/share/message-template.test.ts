import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WHATSAPP_TEMPLATE,
  buildWhatsappShareUrl,
  normalizeTurkishPhoneForWhatsapp,
  renderWhatsappMessage,
} from './message-template'

// GitHub issue #36 / Prompt 6.2 — VERİFİKASYON gereği: "test the message
// construction... independent of the actual network call". Bu dosya
// gönderme MEKANİZMASINA (wa.me'nin gerçekten açılıp açılmadığına) hiç
// dokunmaz, sadece SAF metin üretimini test eder.
describe('renderWhatsappMessage', () => {
  it('yer tutucuları değiştirir', () => {
    const message = renderWhatsappMessage(null, {
      clientName: 'Ayşe Yılmaz',
      planName: 'Kilo verme planı',
      shareUrl: 'https://ogun.app/p/abc123',
    })
    expect(message).toContain('Ayşe Yılmaz')
    expect(message).toContain('Kilo verme planı')
    expect(message).toContain('https://ogun.app/p/abc123')
  })

  it('şablon null/boş ise varsayılan şablonu kullanır', () => {
    const message = renderWhatsappMessage('', {
      clientName: 'Ayşe',
      planName: 'Plan',
      shareUrl: 'https://x.test/p/t',
    })
    expect(message).toBe(
      DEFAULT_WHATSAPP_TEMPLATE.replaceAll('{danisanAdi}', 'Ayşe')
        .replaceAll('{planAdi}', 'Plan')
        .replaceAll('{link}', 'https://x.test/p/t'),
    )
  })

  it('klinik özel şablonunu (bkz. /ayarlar/paylasim) kullanır', () => {
    const message = renderWhatsappMessage('Selam {danisanAdi}! Linkiniz: {link}', {
      clientName: 'Mehmet',
      planName: 'Plan',
      shareUrl: 'https://x.test/p/t2',
    })
    expect(message).toBe('Selam Mehmet! Linkiniz: https://x.test/p/t2')
  })
})

describe('normalizeTurkishPhoneForWhatsapp', () => {
  it('0 ile başlayan yerel numarayı 90 ile başlayan uluslararası biçime çevirir', () => {
    expect(normalizeTurkishPhoneForWhatsapp('0555 123 45 67')).toBe('905551234567')
  })

  it('+90 ile başlayan numarayı olduğu gibi (rakamlara indirgenmiş) bırakır', () => {
    expect(normalizeTurkishPhoneForWhatsapp('+90 555 123 45 67')).toBe('905551234567')
  })

  it('10 haneli (başında 0 olmayan) yerel numaraya 90 ekler', () => {
    expect(normalizeTurkishPhoneForWhatsapp('5551234567')).toBe('905551234567')
  })

  it('boş girdi için null döner', () => {
    expect(normalizeTurkishPhoneForWhatsapp('')).toBeNull()
  })
})

describe('buildWhatsappShareUrl', () => {
  it('telefon numarası varsa wa.me/<numara>?text=... üretir', () => {
    const url = buildWhatsappShareUrl('05551234567', 'Merhaba')
    expect(url).toBe('https://wa.me/905551234567?text=Merhaba')
  })

  it('telefon numarası yoksa wa.me/?text=... üretir (kişi seçimi kullanıcıya bırakılır)', () => {
    const url = buildWhatsappShareUrl(null, 'Merhaba')
    expect(url).toBe('https://wa.me/?text=Merhaba')
  })

  it('mesajı URL-encode eder', () => {
    const url = buildWhatsappShareUrl('05551234567', 'Merhaba dünya & selam')
    expect(url).toContain(encodeURIComponent('Merhaba dünya & selam'))
  })
})
