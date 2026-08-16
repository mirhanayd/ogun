// Hedef takibi hesapları — GitHub issue #18 / Prompt 4.2, GÖREV 4. Saf
// fonksiyonlar: trend eğimi (son 4 haftalık ölçümlerin doğrusal regresyonu),
// ilerleme yüzdesi, tahmini hedefe varış tarihi ve GÜVENLİK eşiği (haftalık
// >1kg kayıp uyarısı). warnings.ts'teki checkWeeklyWeightLossSafety BENZER
// ama FARKLI bir şeyi ölçer: o, planlanan bir kalori açığından TAHMİNİ
// kaybı hesaplar; buradaki fonksiyon GERÇEKTEN ÖLÇÜLMÜŞ kilo verilerinden
// GERÇEKLEŞEN trendi hesaplar. İkisi de aynı NutritionWarning şeklini ve aynı
// 1 kg/hafta eşiğini paylaşıyor (bkz. warnings.ts MAX_SAFE_WEEKLY_LOSS_KG).
import type { NutritionWarning } from './warnings'

export interface TimeSeriesPoint {
  date: Date
  value: number
}

// Basit doğrusal regresyon (en küçük kareler) — verilen noktalardaki eğimi
// GÜNLÜK birimde döner. Tek başına dışa açılmıyor, calculateTrailingSlope
// bunu haftalık birime çevirip kullanıyor.
function linearRegressionSlopePerDay(points: TimeSeriesPoint[]): number | null {
  if (points.length < 2) return null

  const sorted = [...points].sort((a, b) => a.date.getTime() - b.date.getTime())
  const originMs = sorted[0]!.date.getTime()
  const xs = sorted.map((point) => (point.date.getTime() - originMs) / (24 * 60 * 60 * 1000))
  const ys = sorted.map((point) => point.value)

  const n = xs.length
  const sumX = xs.reduce((sum, x) => sum + x, 0)
  const sumY = ys.reduce((sum, y) => sum + y, 0)
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i]!, 0)
  const sumXX = xs.reduce((sum, x) => sum + x * x, 0)

  const denominator = n * sumXX - sumX * sumX
  // Tüm noktalar AYNI güne denk geliyorsa (denominator = 0) eğim tanımsız —
  // bu durumda trend hesaplanamaz, çağıran taraf null'a düşer.
  if (denominator === 0) return null

  return (n * sumXY - sumX * sumY) / denominator
}

const DEFAULT_TRAILING_WINDOW_DAYS = 28 // "son 4 hafta"

// Son 4 haftalık (varsayılan pencere) ölçümlerden haftalık değişim eğimini
// hesaplar (kg/hafta veya % puan/hafta, girdiye göre). Kilo VERİYORSA negatif,
// artıyorsa pozitif döner. Pencere içinde 2'den az nokta varsa (trend
// hesaplanamayacak kadar az veri) null döner.
export function calculateTrailingSlope(
  points: TimeSeriesPoint[],
  windowDays: number = DEFAULT_TRAILING_WINDOW_DAYS,
): number | null {
  if (points.length === 0) return null

  const latest = points.reduce(
    (max, point) => (point.date > max ? point.date : max),
    points[0]!.date,
  )
  const windowStart = new Date(latest.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const windowPoints = points.filter((point) => point.date >= windowStart && point.date <= latest)

  const slopePerDay = linearRegressionSlopePerDay(windowPoints)
  return slopePerDay === null ? null : slopePerDay * 7
}

// Şu anki değerden hedefe, verilen haftalık eğimle devam edilirse ne zaman
// ulaşılacağını tahmin eder. Eğim sıfırsa VEYA hedeften UZAKLAŞIYORSA (yön
// yanlışsa) tahmin edilemez -> null.
export function projectGoalReachDate(
  currentValue: number,
  targetValue: number,
  weeklySlope: number,
  asOf: Date = new Date(),
): Date | null {
  const remaining = targetValue - currentValue
  // Hedefe zaten ulaşılmış.
  if (remaining === 0) return asOf
  if (weeklySlope === 0) return null
  // remaining ve weeklySlope AYNI işaretli olmalı (ör. kilo vermesi
  // gerekiyorsa (remaining<0) eğim de negatif olmalı) — aksi halde hedeften
  // uzaklaşılıyor demektir, tahmin anlamsız.
  const weeksNeeded = remaining / weeklySlope
  if (weeksNeeded <= 0) return null

  const daysNeeded = weeksNeeded * 7
  return new Date(asOf.getTime() + daysNeeded * 24 * 60 * 60 * 1000)
}

// Başlangıç -> hedef yolunda şu anki konumu yüzdeye çevirir. 0-100 arasına
// sıkıştırılır (aşım/negatif ilerleme UI'da metin olarak ayrıca gösterilebilir,
// ilerleme çubuğu 0-100 dışına taşmamalı).
export function calculateGoalProgressPercent(
  startValue: number,
  currentValue: number,
  targetValue: number,
): number {
  const totalChange = targetValue - startValue
  if (totalChange === 0) return 100

  const currentChange = currentValue - startValue
  const percent = (currentChange / totalChange) * 100
  return Math.min(100, Math.max(0, percent))
}

const MAX_SAFE_WEEKLY_LOSS_KG = 1

// GÜVENLİK (GÖREV 4): GERÇEK ölçüm trendinden haftalık kayıp hızı 1 kg'ı
// aşıyorsa uyar. weeklySlopeKg NEGATİF ise kilo kaybı demektir (bkz.
// calculateTrailingSlope) — bu yüzden burada -weeklySlopeKg pozitif kayıp
// hızına çevrilir.
export function checkMeasuredWeeklyLossSafety(weeklySlopeKg: number): NutritionWarning[] {
  const weeklyLossKg = -weeklySlopeKg
  if (weeklyLossKg <= MAX_SAFE_WEEKLY_LOSS_KG) return []

  return [
    {
      code: 'EXCESSIVE_MEASURED_WEEKLY_LOSS',
      severity: 'danger',
      message: `Son 4 haftalık ölçüm trendine göre haftalık kayıp ${weeklyLossKg.toFixed(2)} kg, güvenli üst sınırı (${MAX_SAFE_WEEKLY_LOSS_KG} kg/hafta) aşıyor.`,
    },
  ]
}
