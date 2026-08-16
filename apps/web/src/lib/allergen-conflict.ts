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
): AllergenConflict[] {
  const normalizedName = normalizeSearchText(foodNameTr)
  if (normalizedName === '') return []

  const conflicts: AllergenConflict[] = []
  for (const entry of allergies ?? []) {
    if (entry.normalized && normalizedName.includes(entry.normalized)) {
      conflicts.push({ entry, kind: 'allergy' })
    }
  }
  for (const entry of intolerances ?? []) {
    if (entry.normalized && normalizedName.includes(entry.normalized)) {
      conflicts.push({ entry, kind: 'intolerance' })
    }
  }
  return conflicts
}

// Bir plandaki TÜM besinler (foodId -> nameTr) için toplu çakışma haritası —
// panel-level uyarı ("N kalemde alerjen çakışması var") ve satır ikonları
// AYNI hesabı tekrar tekrar çağırmasın diye tek seferde üretilir.
export function buildAllergenConflictMap(
  foodNamesById: ReadonlyMap<string, string>,
  allergies: readonly ClientAllergenEntry[] | null | undefined,
  intolerances: readonly ClientAllergenEntry[] | null | undefined,
): Map<string, AllergenConflict[]> {
  const result = new Map<string, AllergenConflict[]>()
  if ((!allergies || allergies.length === 0) && (!intolerances || intolerances.length === 0)) {
    return result
  }
  for (const [foodId, nameTr] of foodNamesById) {
    const conflicts = findAllergenConflicts(nameTr, allergies, intolerances)
    if (conflicts.length > 0) result.set(foodId, conflicts)
  }
  return result
}
