// Türkçe (ve BLS'in Almanca isimleri için Almanca) arama normalizasyonu:
// ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c, ä→a, ß→ss, küçük harf, noktalama temizliği.
const CHAR_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ş: 's',
  Ş: 's',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
  ä: 'a',
  Ä: 'a',
  ß: 'ss',
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g

export function normalizeSearchText(input: string): string {
  const mapped = input
    .split('')
    .map((char) => CHAR_MAP[char] ?? char)
    .join('')

  return mapped
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '') // kalan aksanları (ör. é, à) sil
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
