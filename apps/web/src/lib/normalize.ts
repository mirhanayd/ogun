// Sunucudaki foods.searchText ile aynı normalizasyon (bkz. packages/db/src/lib/normalize.ts).
// İstemci tarafında ayrı bir pakete bağımlılık yaratmamak için küçük bir kopyası tutuluyor.
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
