import type { ClientAllergenEntry } from '@ogun/db/schema'
import { normalizeSearchText } from './normalize'

// GitHub issue #26 / Prompt 5.4, GÖREV 3 — "Alerji/intolerans çakışması →
// kalem satırında kırmızı ikon + panelde uyarı". schema/clients.ts'teki
// ClientAllergenEntry üstündeki not BUNU şöyle tarifliyor: "plan editörü
// ileride bu kalemin besin adı, danışanın alerjen listesindeki normalized
// değerlerden biriyle örtüşüyor mu diye basit bir string eşleşmesiyle
// kırmızı işaretleyebilecek" — bu dosya TAM OLARAK o basit eşleşmeyi
// uyguluyor, foodId'ye bağlı bir ICD/alerjen kodlaması İCAT ETMİYOR.
export type AllergenConflictKind = 'allergy' | 'intolerance'

export interface AllergenConflict {
  entry: ClientAllergenEntry
  kind: AllergenConflictKind
  matchedOn: 'food_name' | 'ingredient'
  matchedText: string
}

const ALLERGEN_TERM_GROUPS = [
  ['sut', 'yogurt', 'peynir', 'krema', 'tereyagi', 'ayran', 'kefir', 'laktoz'],
  ['gluten', 'bugday', 'bulgur', 'un', 'ekmek', 'makarna', 'arpa', 'cavdar', 'yulaf'],
  ['yumurta'],
  ['yer fistigi', 'peanut', 'fistik ezmesi'],
  ['findik', 'ceviz', 'badem', 'kaju', 'antep fistigi', 'sam fistigi', 'pistachio'],
  ['balik', 'somon', 'ton', 'hamsi', 'levrek', 'cipura'],
  ['kabuklu deniz', 'karides', 'yengec', 'istakoz', 'midye'],
  ['soya'],
  ['susam', 'tahin'],
] as const

function containsTerm(value: string, term: string): boolean {
  // Kısa terimleri serbest alt dize olarak aramak "un" -> "sunum" gibi
  // yanlış pozitifler üretir. Sözcük başı kontrolü Türkçe çekimleri de
  // yakalar: "süt" -> "sütü", "un" -> "unlu".
  if (term.length <= 3) return value.split(/\s+/).some((word) => word.startsWith(term))
  return value.includes(term)
}

function termsForEntry(entry: ClientAllergenEntry): string[] {
  const normalized = entry.normalized || normalizeSearchText(entry.label)
  // Türkçede tek başına "fıstık" yer fıstığı veya Antep fıstığı anlamına
  // gelebilir. Kullanıcı ayrımı belirtmediyse iki grubu da güvenli tarafta
  // kalarak uyar; açıkça belirttiyse grupları birbirine karıştırma.
  if (normalized === 'fistik') {
    return ['fistik', 'yer fistigi', 'peanut', 'fistik ezmesi', 'antep fistigi', 'sam fistigi']
  }
  const group = ALLERGEN_TERM_GROUPS.find((terms) =>
    terms.some((term) => containsTerm(normalized, term)),
  )
  return group ? [...new Set([normalized, ...group])] : [normalized]
}

function matchesEntry(value: string, entry: ClientAllergenEntry): boolean {
  const normalizedValue = normalizeSearchText(value)
  return termsForEntry(entry).some((term) => containsTerm(normalizedValue, term))
}

// Bir besin adının (nameTr) danışanın alerji/intolerans listesiyle
// çakışıp çakışmadığını kontrol eder. "Çakışma" = normalize edilmiş besin
// adı, normalize edilmiş alerjen etiketini İÇERİYOR (ör. besin adı "fıstıklı
// kurabiye" iken alerjen "fıstık" ise eşleşir) — schema'daki notun izin
// verdiği en basit, en az yanlış-negatifli yöntem.
export function findAllergenConflicts(
  foodNameTr: string,
  allergies: readonly ClientAllergenEntry[] | null | undefined,
  intolerances: readonly ClientAllergenEntry[] | null | undefined,
  ingredientNames: readonly string[] = [],
): AllergenConflict[] {
  const normalizedName = normalizeSearchText(foodNameTr)
  if (normalizedName === '') return []

  const conflicts: AllergenConflict[] = []
  for (const [entries, kind] of [
    [allergies ?? [], 'allergy'],
    [intolerances ?? [], 'intolerance'],
  ] as const) {
    for (const entry of entries) {
      if (matchesEntry(foodNameTr, entry)) {
        conflicts.push({ entry, kind, matchedOn: 'food_name', matchedText: foodNameTr })
        continue
      }
      const ingredient = ingredientNames.find((name) => matchesEntry(name, entry))
      if (ingredient) {
        conflicts.push({ entry, kind, matchedOn: 'ingredient', matchedText: ingredient })
      }
    }
  }
  return conflicts
}

// Bir plandaki TÜM besinler (foodId -> nameTr) için toplu çakışma haritası —
// panel-level uyarı ("N kalemde alerjen çakışması var") ve satır ikonları
// AYNI hesabı tekrar tekrar çağırmasın diye tek seferde üretilir.
export function buildAllergenConflictMap(
  foodContentsById: ReadonlyMap<string, { nameTr: string; ingredientNames: readonly string[] }>,
  allergies: readonly ClientAllergenEntry[] | null | undefined,
  intolerances: readonly ClientAllergenEntry[] | null | undefined,
): Map<string, AllergenConflict[]> {
  const result = new Map<string, AllergenConflict[]>()
  if ((!allergies || allergies.length === 0) && (!intolerances || intolerances.length === 0)) {
    return result
  }
  for (const [foodId, food] of foodContentsById) {
    const conflicts = findAllergenConflicts(
      food.nameTr,
      allergies,
      intolerances,
      food.ingredientNames,
    )
    if (conflicts.length > 0) result.set(foodId, conflicts)
  }
  return result
}
