import { z } from 'zod'
// TİP-ONLY içe aktarım — client-schemas.ts'teki AYNI desen (bkz. o dosyanın
// başındaki not): drizzle-orm'u istemci paketine sürüklememek için değer
// listeleri burada elle, İngilizce/Türkçe DB değerleriyle birebir eşleşecek
// şekilde tekrar tanımlanıyor.
import type { GoalType, MeasurementSource } from '@ogun/db/schema'

// ---------------------------------------------------------------------------
// Sözlükler (UI etiketleri)
// ---------------------------------------------------------------------------

export const MEASUREMENT_SOURCE_OPTIONS: { value: MeasurementSource; label: string }[] = [
  { value: 'manuel', label: 'Manuel' },
  { value: 'inbody', label: 'InBody' },
  { value: 'tanita', label: 'Tanita' },
  { value: 'accuniq', label: 'Accuniq' },
]
export const MEASUREMENT_SOURCE_LABELS_TR: Record<MeasurementSource, string> = {
  manuel: 'Manuel',
  inbody: 'InBody',
  tanita: 'Tanita',
  accuniq: 'Accuniq',
}

export const GOAL_TYPE_OPTIONS: { value: GoalType; label: string; unit: string }[] = [
  { value: 'kilo', label: 'Kilo', unit: 'kg' },
  { value: 'yağ_oranı', label: 'Yağ oranı', unit: '%' },
  { value: 'çevre', label: 'Çevre ölçüsü', unit: 'cm' },
]
export const GOAL_TYPE_LABELS_TR: Record<GoalType, string> = {
  kilo: 'Kilo',
  yağ_oranı: 'Yağ oranı',
  çevre: 'Çevre ölçüsü',
}

// ---------------------------------------------------------------------------
// Ölçüm giriş formu (GitHub issue #18 / Prompt 4.2, GÖREV 2)
// ---------------------------------------------------------------------------
//
// TEK bir şema/form bileşeni hem "hızlı mod" (sadece kilo) hem "detaylı mod"
// (tüm alanlar, sekmeli) için kullanılır — moda göre değişen sadece HANGİ
// alanların GÖRÜNÜR olduğu (measurement-form.tsx'teki sekme durumu), doğrulama
// kuralları AYNI: weightKg + measuredAt zorunlu, gerisi opsiyonel. Bu, kullanıcı
// hızlı modda girip sonra detaylı moda geçerse (veya tersi) girilen değerlerin
// KAYBOLMAMASINI sağlıyor (tek react-hook-form state'i, iki görünüm).

// GG.AA.YYYY değil YYYY-MM-DD — client-schemas.ts birthDateFieldSchema ile
// AYNI desen (<input type="date"> tarayıcı formatı).
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

const measuredAtSchema = z
  .string()
  .trim()
  .min(1, 'Ölçüm tarihi zorunludur.')
  .refine((value) => isoDatePattern.test(value), 'Ölçüm tarihi geçersiz.')
  .refine(
    (value) =>
      !isoDatePattern.test(value) || new Date(value).getTime() <= Date.now() + 24 * 60 * 60 * 1000,
    {
      message: 'Ölçüm tarihi gelecekte olamaz.',
    },
  )

const weightKgSchema = z
  .string()
  .trim()
  .min(1, 'Kilo zorunludur.')
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Geçerli bir kilo girin.')
  .refine((value) => Number(value) <= 500, 'Kilo 500 kg üzerinde olamaz.')

// Opsiyonel bir ondalık ölçüm alanı — boş bırakılabilir (detaylı modda bile
// diyetisyen elindeki cihazın ölçmediği bir alanı boş geçebilmeli).
function decimalField(max: number, label: string) {
  return z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= max),
      `${label} geçersiz.`,
    )
    .optional()
    .or(z.literal(''))
}

export const measurementFormSchema = z.object({
  measuredAt: measuredAtSchema,
  source: z.enum(['manuel', 'inbody', 'tanita', 'accuniq']),
  weightKg: weightKgSchema,
  heightCm: decimalField(300, 'Boy'),
  waistCm: decimalField(300, 'Bel çevresi'),
  hipCm: decimalField(300, 'Kalça çevresi'),
  neckCm: decimalField(100, 'Boyun çevresi'),
  armCm: decimalField(100, 'Kol çevresi'),
  thighCm: decimalField(150, 'Uyluk çevresi'),
  chestCm: decimalField(300, 'Göğüs çevresi'),
  bodyFatPct: decimalField(100, 'Vücut yağ yüzdesi'),
  bodyFatKg: decimalField(300, 'Yağ kütlesi'),
  leanMassKg: decimalField(300, 'Yağsız kütle'),
  muscleMassKg: decimalField(300, 'Kas kütlesi'),
  totalBodyWaterL: decimalField(200, 'Toplam vücut suyu'),
  visceralFatLevel: decimalField(60, 'Visseral yağ seviyesi'),
  bmrKcal: decimalField(6000, 'BMH'),
  phaseAngle: decimalField(20, 'Faz açısı'),
  notes: z.string().trim().max(2000, 'Notlar çok uzun.').optional().or(z.literal('')),
})
export type MeasurementFormValues = z.infer<typeof measurementFormSchema>

export const MEASUREMENT_FORM_DEFAULT_VALUES: MeasurementFormValues = {
  measuredAt: new Date().toISOString().slice(0, 10),
  source: 'manuel',
  weightKg: '',
  heightCm: '',
  waistCm: '',
  hipCm: '',
  neckCm: '',
  armCm: '',
  thighCm: '',
  chestCm: '',
  bodyFatPct: '',
  bodyFatKg: '',
  leanMassKg: '',
  muscleMassKg: '',
  totalBodyWaterL: '',
  visceralFatLevel: '',
  bmrKcal: '',
  phaseAngle: '',
  notes: '',
}

// ---------------------------------------------------------------------------
// Hedef takibi formu (GÖREV 4)
// ---------------------------------------------------------------------------

// targetDate BİLEREK measuredAtSchema'dan FARKLI — bir hedef tarihi
// TANIM GEREĞİ gelecekte olur (bkz. schema/measurements.ts clientGoals.targetDate
// üstündeki not), bu yüzden "gelecekte olamaz" kısıtı burada YOK.
const targetDateSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || isoDatePattern.test(value), 'Hedef tarihi geçersiz.')
  .optional()
  .or(z.literal(''))

function positiveValueField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} zorunludur.`)
    .refine(
      (value) => Number.isFinite(Number(value)) && Number(value) > 0,
      `Geçerli bir ${label.toLowerCase()} girin.`,
    )
}

export const goalFormSchema = z.object({
  type: z.enum(['kilo', 'yağ_oranı', 'çevre']),
  targetValue: positiveValueField('Hedef değer'),
  targetDate: targetDateSchema,
  startValue: positiveValueField('Başlangıç değeri'),
})
export type GoalFormValues = z.infer<typeof goalFormSchema>
