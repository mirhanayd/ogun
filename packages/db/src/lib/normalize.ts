// Türkçe arama normalizasyonu: ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c, küçük harf,
// noktalama temizliği. foods.searchText bu fonksiyonla üretildi (bkz.
// packages/etl/src/lib/normalize.ts — aynı mantık, ETL paketine bağımlılık
// yaratmamak için burada küçük bir kopyası tutuluyor); arama sorgusu da
// aynı şekilde normalize edilmeli ki eşleşsin.
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
}

const COMBINING_DIACRITICS = /[̀-ͯ]/g

export function normalizeSearchText(input: string): string {
  const mapped = input
    .split('')
    .map((char) => CHAR_MAP[char] ?? char)
    .join('')

  return mapped
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
