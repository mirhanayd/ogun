import { describe, expect, it } from 'vitest'
import {
  guessColumnMapping,
  parseBirthDateCell,
  parseWeightHistoryCell,
  validateImportRow,
} from './client-import'

// GitHub issue #47 / Prompt 8.3, GÖREV 3 — bu test dosyası GERÇEKÇİ bozuk
// bir CSV'nin (eksik sütun, karışık tarih formatı, boş satır, sıra
// karışıklığı) doğru işlendiğini doğruluyor — "sadece mutlu yol" bir demo
// DEĞİL (bkz. roadmap'in "satış kapatan özellik" gerekçesi).

describe('guessColumnMapping', () => {
  it('yaygın Türkçe/İngilizce başlık varyasyonlarını doğru hedef alana eşler', () => {
    const mapping = guessColumnMapping(['Ad', 'Soyad', 'Telefon', 'Doğum Tarihi', 'Kilo Geçmişi'])
    expect(mapping['Ad']).toBe('firstName')
    expect(mapping['Soyad']).toBe('lastName')
    expect(mapping['Telefon']).toBe('phone')
    expect(mapping['Doğum Tarihi']).toBe('birthDate')
    expect(mapping['Kilo Geçmişi']).toBe('weightHistory')
  })

  it('sıra/adı bilinmeyen bir sütunu "ignore" olarak bırakır', () => {
    const mapping = guessColumnMapping(['İl', 'Ad'])
    expect(mapping['İl']).toBe('ignore')
  })

  it('aynı hedefe iki sütun birden otomatik eşlenmez — ikinci sütun ignore kalır', () => {
    const mapping = guessColumnMapping(['Ad', 'İsim'])
    expect(mapping['Ad']).toBe('firstName')
    expect(mapping['İsim']).toBe('ignore')
  })
})

describe('parseBirthDateCell', () => {
  it('ISO (YYYY-MM-DD) biçimini kabul eder', () => {
    expect(parseBirthDateCell('1990-05-12')).toBe('1990-05-12')
  })

  it('GG.AA.YYYY ve GG/AA/YYYY biçimlerini ISO\'ya çevirir', () => {
    expect(parseBirthDateCell('12.05.1990')).toBe('1990-05-12')
    expect(parseBirthDateCell('12/05/1990')).toBe('1990-05-12')
  })

  it('tanınmayan bir biçim için null döner (satırı reddetmez, sadece uyarır)', () => {
    expect(parseBirthDateCell('12 Mayıs 1990')).toBeNull()
  })

  it('boş hücre için null döner', () => {
    expect(parseBirthDateCell('  ')).toBeNull()
  })
})

describe('parseWeightHistoryCell', () => {
  it('tarihsiz tek bir değeri bugünün tarihiyle ayrıştırır', () => {
    const result = parseWeightHistoryCell('72.5')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.weightKg).toBe(72.5)
    expect(result.invalidSegments).toHaveLength(0)
  })

  it('Türkçe ondalık virgülü kabul eder', () => {
    const result = parseWeightHistoryCell('72,5')
    expect(result.entries[0]!.weightKg).toBe(72.5)
  })

  it('";" VEYA "|" ile ayrılmış birden fazla tarihli değeri ayrıştırır', () => {
    const result = parseWeightHistoryCell('2024-01-15:72.5;2024-03-01:70.2|2024-05-01:69')
    expect(result.entries).toHaveLength(3)
    expect(result.entries.map((e) => e.weightKg)).toEqual([72.5, 70.2, 69])
    expect(result.entries[0]!.measuredAt.toISOString().slice(0, 10)).toBe('2024-01-15')
  })

  it('okunamayan bir parçayı invalidSegments\'e ekler, GERİ KALANI atmaz', () => {
    const result = parseWeightHistoryCell('72.5;abc;2024-01-01:70')
    expect(result.entries).toHaveLength(2)
    expect(result.invalidSegments).toEqual(['abc'])
  })

  it('gerçekçi olmayan kiloyu (ör. 0 veya 900 kg) reddeder', () => {
    const result = parseWeightHistoryCell('0;900;75')
    expect(result.entries).toHaveLength(1)
    expect(result.invalidSegments).toEqual(['0', '900'])
  })
})

describe('validateImportRow — gerçekçi bozuk CSV senaryoları', () => {
  it('ad+soyad+telefon+doğum tarihi+kilo geçmişi dolu bir satırı kabul eder', () => {
    const result = validateImportRow(2, {
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
      phone: '0532 123 45 67',
      birthDate: '1985-03-20',
      weightHistory: '2024-01-01:80;2024-06-01:75',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.firstName).toBe('Ayşe')
      expect(result.weightHistory).toHaveLength(2)
      expect(result.warnings).toHaveLength(0)
    }
  })

  it('ad VEYA soyad eksikse satırı reddeder (rakip sistemden gelen eksik veri)', () => {
    const missingLastName = validateImportRow(3, { firstName: 'Mehmet', lastName: '' })
    expect(missingLastName.ok).toBe(false)
    if (!missingLastName.ok) expect(missingLastName.reason).toContain('Soyad')

    const missingBoth = validateImportRow(4, { firstName: '', lastName: '' })
    expect(missingBoth.ok).toBe(false)
  })

  it('okunamayan doğum tarihi satırı REDDETMEZ, sadece uyarı ekler ve alanı boş bırakır', () => {
    const result = validateImportRow(5, { firstName: 'Ali', lastName: 'Veli', birthDate: '31 Şubat 1990' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.birthDate).toBeNull()
      expect(result.warnings.some((w) => w.includes('Doğum tarihi'))).toBe(true)
    }
  })

  it('gelecekteki bir doğum tarihini reddedip uyarı ekler', () => {
    const result = validateImportRow(6, { firstName: 'Ali', lastName: 'Veli', birthDate: '2999-01-01' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.birthDate).toBeNull()
  })

  it('sadece ad/soyad dolu, diğer sütunlar hiç eşlenmemiş (undefined) bir satırı kabul eder', () => {
    const result = validateImportRow(7, { firstName: 'Zeynep', lastName: 'Kaya' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.phone).toBeNull()
      expect(result.birthDate).toBeNull()
      expect(result.weightHistory).toHaveLength(0)
    }
  })
})
