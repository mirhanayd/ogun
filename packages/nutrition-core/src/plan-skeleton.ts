// GitHub issue #27 / Prompt 5.5, GÖREV 4 — "hedeften plan iskeleti".
// KURAL (bu paketin geneli): saf TypeScript, React/Next/DB/I-O yok. Bu dosya
// TEE'yi KENDİSİ hesaplamaz — energy-requirement.ts'teki
// calculateDailyEnergyRequirement zaten var, tekrar YAZILMAZ, çağıran katman
// (apps/web) onu burada tanımlanan fonksiyonlarla birlikte kullanır. Burada
// sadece roadmap'in "TEE'den SONRA gelen" iki adımı yaşıyor:
//   1) hedef kaloriyi bir makro dağılımına (gram) çevirmek,
//   2) toplam kaloriyi seçilen öğün sayısına (ağırlıklı) dağıtmak.
// "Otomatik besin ÖNERME" kuralı BURADA da geçerli — bu modül hiçbir besin
// önermez, sadece SAYI üretir (gram hedefleri, öğün başına kcal).

// ---------------------------------------------------------------------------
// Makro dağılımı
// ---------------------------------------------------------------------------

export type MacroDistributionPreset = 'balanced' | 'low_carb' | 'high_protein' | 'custom'

export interface MacroPercentages {
  proteinPct: number
  carbPct: number
  fatPct: number
}

export interface MacroTargetGrams {
  proteinG: number
  carbG: number
  fatG: number
}

// GÖREV 4 — "Makro dağılımı seç (dengeli / düşük karbonhidrat / yüksek
// protein / özel)". Yüzdeler klinik pratikte yaygın kabul gören aralıkların
// orta noktaları — 'custom' burada YOK çünkü onun yüzdelerini kullanıcı
// kendisi girer (bkz. calculateMacroTargets'ın 'custom' için AYRI bir preset
// beklemeden doğrudan MacroPercentages alması).
export const MACRO_DISTRIBUTION_PRESETS: Record<
  Exclude<MacroDistributionPreset, 'custom'>,
  MacroPercentages
> = {
  balanced: { proteinPct: 20, carbPct: 50, fatPct: 30 },
  low_carb: { proteinPct: 30, carbPct: 25, fatPct: 45 },
  high_protein: { proteinPct: 35, carbPct: 35, fatPct: 30 },
}

const PERCENTAGE_TOLERANCE = 0.5

// Protein/karbonhidrat 4 kcal/g, yağ 9 kcal/g — Atwater katsayıları (bkz.
// energy.ts calculateAtwaterEnergy ile AYNI sabitler, burada TERSİNE
// (kalori -> gram) kullanılıyor).
const KCAL_PER_GRAM_PROTEIN = 4
const KCAL_PER_GRAM_CARB = 4
const KCAL_PER_GRAM_FAT = 9

// Hedef kaloriyi verilen yüzdelere göre grama çevirir. Yüzdeler toplamı
// %100'den (±0.5 tolerans) sapıyorsa hata fırlatır — sessizce normalize
// ETMEZ, çünkü 'custom' modda bu diyetisyenin bir GİRİŞ HATASI olabilir ve
// sessizce düzeltmek yanıltıcı bir hedef üretir.
export function calculateMacroTargets(
  targetKcal: number,
  percentages: MacroPercentages,
): MacroTargetGrams {
  if (targetKcal <= 0) {
    throw new Error('Hedef kalori sıfırdan büyük olmalıdır.')
  }
  const sum = percentages.proteinPct + percentages.carbPct + percentages.fatPct
  if (Math.abs(sum - 100) > PERCENTAGE_TOLERANCE) {
    throw new Error(`Makro yüzdeleri toplamı %100 olmalıdır (şu an %${sum.toFixed(1)}).`)
  }
  if (percentages.proteinPct < 0 || percentages.carbPct < 0 || percentages.fatPct < 0) {
    throw new Error('Makro yüzdeleri negatif olamaz.')
  }

  return {
    proteinG: (targetKcal * (percentages.proteinPct / 100)) / KCAL_PER_GRAM_PROTEIN,
    carbG: (targetKcal * (percentages.carbPct / 100)) / KCAL_PER_GRAM_CARB,
    fatG: (targetKcal * (percentages.fatPct / 100)) / KCAL_PER_GRAM_FAT,
  }
}

// ---------------------------------------------------------------------------
// Öğün sayısına göre kalori dağıtımı
// ---------------------------------------------------------------------------

// GÖREV 4 — "Öğün sayısı seç → öğünlere kalori dağıt". Girdi olarak AĞIRLIK
// dizisi alır (öğün TÜRÜ bilgisi bu paketin kapsamı DIŞINDA — hangi öğün
// türünün hangi ağırlığı taşıyacağı bir UI/ürün kararı, bkz. apps/web
// tarafındaki MEAL_COUNT_WEIGHT_PRESETS). Ağırlıklar normalize edilir
// (toplamları 1 olmak ZORUNDA değil), tam sayıya yuvarlanır, ve YUVARLAMA
// SAPMASI son öğeye eklenerek toplamın targetKcal'e TAM eşit kalması
// sağlanır — aksi halde 3-5 kcal'lık tutarsızlıklar plan editöründeki
// "toplam hedefe eşit" beklentisini bozar.
export function distributeCalories(targetKcal: number, weights: number[]): number[] {
  if (weights.length === 0) {
    throw new Error('En az bir öğün ağırlığı gereklidir.')
  }
  if (targetKcal < 0) {
    throw new Error('Hedef kalori negatif olamaz.')
  }
  const weightSum = weights.reduce((acc, w) => acc + w, 0)
  if (weightSum <= 0) {
    throw new Error('Öğün ağırlıklarının toplamı sıfırdan büyük olmalıdır.')
  }

  const rounded = weights.map((w) => Math.round(targetKcal * (w / weightSum)))
  const roundedSum = rounded.reduce((acc, v) => acc + v, 0)
  const drift = Math.round(targetKcal) - roundedSum

  // Sapma son (en son) öğüne eklenir — küçük (genelde ±1-2 kcal) ve tek bir
  // öğüne yığıldığında pratikte fark edilmez, ama toplamın tutarlılığı
  // (targetKcal ile TAM eşit olması) plan editörünün "hedefe göre sapma"
  // göstergesiyle çelişmemesi için önemli.
  rounded[rounded.length - 1] = (rounded[rounded.length - 1] ?? 0) + drift

  return rounded
}
