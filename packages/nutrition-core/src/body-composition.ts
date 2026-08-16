// Vücut kompozisyonu türetilmiş alanları — GitHub issue #18 / Prompt 4.2,
// GÖREV 1'in istediği gibi bunlar measurements tablosunda birer SÜTUN DEĞİL,
// saf hesap fonksiyonu olarak burada yaşıyor (bkz.
// packages/db/src/schema/measurements.ts dosya başı notu). Bu paketin geri
// kalanıyla (energy-requirement.ts, warnings.ts) aynı desen: DB/React'tan
// habersiz, girdi verilen sayı, çıktı hesaplanan sayı.

export function calculateBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100
  return weightKg / (heightM * heightM)
}

// WHO eşikleri — klinik pratikte en yaygın kullanılan sınıflandırma.
export type BmiCategory = 'zayıf' | 'normal' | 'fazla_kilolu' | 'obez'

export function classifyBmi(bmi: number): BmiCategory {
  if (bmi < 18.5) return 'zayıf'
  if (bmi < 25) return 'normal'
  if (bmi < 30) return 'fazla_kilolu'
  return 'obez'
}

// Bel-kalça oranı (waist-to-hip ratio) — kardiyometabolik risk göstergesi.
export function calculateWaistHipRatio(waistCm: number, hipCm: number): number {
  return waistCm / hipCm
}

// Bel-boy oranı (waist-to-height ratio) — 0.5 eşiği yaygın klinik referans.
export function calculateWaistHeightRatio(waistCm: number, heightCm: number): number {
  return waistCm / heightCm
}

export interface IdealWeightRange {
  minKg: number
  maxKg: number
}

// "Sağlıklı" BKİ aralığına (18.5–24.9) karşılık gelen kilo aralığı — boy
// sabitken BKİ formülünün tersine çevrilmesi: kilo = BKİ × boy(m)².
const HEALTHY_BMI_MIN = 18.5
const HEALTHY_BMI_MAX = 24.9

export function calculateIdealWeightRange(heightCm: number): IdealWeightRange {
  const heightM = heightCm / 100
  const heightMSquared = heightM * heightM
  return {
    minKg: HEALTHY_BMI_MIN * heightMSquared,
    maxKg: HEALTHY_BMI_MAX * heightMSquared,
  }
}

export interface BodyCompositionSummary {
  bmi: number | null
  bmiCategory: BmiCategory | null
  waistHipRatio: number | null
  waistHeightRatio: number | null
  idealWeightRange: IdealWeightRange | null
}

// Bir ölçüm satırından (nullable alanlar) mevcut olan tüm türetilmiş
// değerleri tek seferde hesaplar — eksik girdi gerektiren alanlar sessizce
// null bırakılır (ör. bel ölçümü girilmemişse bel-boy oranı null).
export function summarizeBodyComposition(input: {
  weightKg: number | null
  heightCm: number | null
  waistCm: number | null
  hipCm: number | null
}): BodyCompositionSummary {
  const bmi =
    input.weightKg !== null && input.heightCm !== null
      ? calculateBmi(input.weightKg, input.heightCm)
      : null
  return {
    bmi,
    bmiCategory: bmi !== null ? classifyBmi(bmi) : null,
    waistHipRatio:
      input.waistCm !== null && input.hipCm !== null
        ? calculateWaistHipRatio(input.waistCm, input.hipCm)
        : null,
    waistHeightRatio:
      input.waistCm !== null && input.heightCm !== null
        ? calculateWaistHeightRatio(input.waistCm, input.heightCm)
        : null,
    idealWeightRange: input.heightCm !== null ? calculateIdealWeightRange(input.heightCm) : null,
  }
}
