import type { Sex } from './energy-requirement'
import type { NutrientValuesPer100g } from './types'

export interface ReferenceRange {
  nutrientCode: string
  // null: o yönde sınır yok (örn. üst sınırı olmayan bir besin öğesi için max: null).
  min: number | null
  max: number | null
  unit: string
}

export interface AgeGroupReference {
  ageGroupCode: string
  ageGroupLabel: string
  sex: Sex | 'all'
  // GitHub issue #26 / Prompt 5.4 — yaş grubu seçimi (selectAgeGroupReference)
  // için yaş aralığı. OPSİYONEL: reference-comparison.test.ts'teki mevcut
  // testler bu alanlar olmadan literal AgeGroupReference nesneleri kuruyor,
  // geriye dönük kırılmasınlar diye zorunlu tutulmadı.
  minAge?: number
  maxAge?: number | null
  ranges: ReferenceRange[]
}

export type ReferenceStatus = 'below' | 'within' | 'above' | 'no_reference'

export interface ReferenceComparisonResult {
  nutrientCode: string
  actualValue: number
  min: number | null
  max: number | null
  status: ReferenceStatus
}

// Hesaplanan plan değerlerini bir yaş grubunun referans aralıklarıyla karşılaştırır.
export function compareToReference(
  nutrients: NutrientValuesPer100g,
  reference: AgeGroupReference,
): ReferenceComparisonResult[] {
  return reference.ranges.map((range) => {
    const actualValue = nutrients[range.nutrientCode] ?? 0

    let status: ReferenceStatus
    if (range.min === null && range.max === null) {
      status = 'no_reference'
    } else if (range.min !== null && actualValue < range.min) {
      status = 'below'
    } else if (range.max !== null && actualValue > range.max) {
      status = 'above'
    } else {
      status = 'within'
    }

    return { nutrientCode: range.nutrientCode, actualValue, min: range.min, max: range.max, status }
  })
}

// GitHub issue #26 / Prompt 5.4, GÖREV 2 — danışanın yaş/cinsiyetine göre
// elimizdeki AgeGroupReference listesinden EN UYGUN grubu seçer. Placeholder
// veri seti (bkz. data/tuber-2022.ts) sadece birkaç yaş grubu içerdiği için
// tam aralık eşleşmesi bulunamazsa, aynı cinsiyetteki (veya 'all') en yakın
// YETİŞKİN grubuna düşer — gerçek TÜBER veri seti geldiğinde bu fallback'in
// gerekliliği azalacak.
export function selectAgeGroupReference(
  references: readonly AgeGroupReference[],
  age: number,
  sex: Sex,
): AgeGroupReference | null {
  const sexMatches = references.filter((ref) => ref.sex === sex || ref.sex === 'all')
  if (sexMatches.length === 0) return null

  const exact = sexMatches.find(
    (ref) => ref.minAge !== undefined && age >= ref.minAge && (ref.maxAge == null || age <= ref.maxAge),
  )
  if (exact) return exact

  // Tam aralık yok — yetişkin (minAge >= 18) gruplar arasından yaşa en yakın
  // olanı seç. Hiç yetişkin grup yoksa (yalnızca çocuk verisi varsa) en yakın
  // grubu (yaş farkı en küçük) seç.
  const adultCandidates = sexMatches.filter((ref) => (ref.minAge ?? 0) >= 18)
  const pool = adultCandidates.length > 0 ? adultCandidates : sexMatches

  return pool.reduce<AgeGroupReference | null>((closest, ref) => {
    if (closest === null) return ref
    const refMid = ((ref.minAge ?? age) + (ref.maxAge ?? ref.minAge ?? age)) / 2
    const closestMid = ((closest.minAge ?? age) + (closest.maxAge ?? closest.minAge ?? age)) / 2
    return Math.abs(age - refMid) < Math.abs(age - closestMid) ? ref : closest
  }, null)
}

export type NutrientLevelBand = 'low' | 'adequate' | 'optimal' | 'excessive' | 'no_reference'

export interface NutrientLevelResult {
  nutrientCode: string
  actualValue: number
  // Yüzde hesabının paydası — referans aralığının ALT sınırı (ör. RDA/AI).
  referenceValue: number | null
  percentOfReference: number | null
  upperLimit: number | null
  band: NutrientLevelBand
}

// GitHub issue #26 / Prompt 5.4, GÖREV 2 — mikro besin öğesi satırlarının
// renk kodu: "kırmızı <%67, sarı %67-90, yeşil %90-110, turuncu >UL (üst
// sınır)". compareToReference'ın within/below/above/no_reference çıktısı bu
// 4'lü bantlamayı DOĞRUDAN karşılamıyor (özellikle "üst sınırın aşılması" ile
// "referansın hafifçe üstünde olma" arasındaki fark) — bu yüzden AYRI bir
// fonksiyon, ama AYNI ReferenceRange/AgeGroupReference girdisini kullanıyor
// (yeniden veri modeli icat etmiyor).
export function classifyNutrientLevel(
  nutrients: NutrientValuesPer100g,
  reference: AgeGroupReference,
): NutrientLevelResult[] {
  return reference.ranges.map((range) => {
    const actualValue = nutrients[range.nutrientCode] ?? 0

    if (range.min === null || range.min === 0) {
      // Yüzde hesabının paydası yok (ör. üst sınırı olan ama RDA'sı olmayan
      // bir besin öğesi, ör. sodyum) — sadece UL kontrolü yapılabilir.
      if (range.max !== null && actualValue > range.max) {
        return {
          nutrientCode: range.nutrientCode,
          actualValue,
          referenceValue: null,
          percentOfReference: null,
          upperLimit: range.max,
          band: 'excessive',
        }
      }
      return {
        nutrientCode: range.nutrientCode,
        actualValue,
        referenceValue: null,
        percentOfReference: null,
        upperLimit: range.max,
        band: range.min === null && range.max === null ? 'no_reference' : 'optimal',
      }
    }

    const percentOfReference = (actualValue / range.min) * 100

    let band: NutrientLevelBand
    if (range.max !== null && actualValue > range.max) {
      band = 'excessive'
    } else if (percentOfReference < 67) {
      band = 'low'
    } else if (percentOfReference < 90) {
      band = 'adequate'
    } else {
      // 90-110 aralığı "yeşil/optimal" — %110'un üstü ama UL'nin altı da
      // (ör. %150) BİLEREK aynı yeşil bantta bırakıldı: spesifikasyon sadece
      // 4 bant tanımlıyor (kırmızı/sarı/yeşil/turuncu), UL aşılmadıkça
      // "fazla ama güvenli" için ayrı bir renk istenmedi.
      band = 'optimal'
    }

    return {
      nutrientCode: range.nutrientCode,
      actualValue,
      referenceValue: range.min,
      percentOfReference,
      upperLimit: range.max,
      band,
    }
  })
}
