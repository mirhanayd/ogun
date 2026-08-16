// Laboratuvar analiti referans aralığı ön tanımları — GitHub issue #19 /
// Prompt 4.3, GÖREV 2: "Sık kullanılan analitler için hazır liste ...
// referans aralıklarıyla, diyetisyen kayıt bazında override edebilsin."
//
// Bu paket saf TypeScript (React/Next/Drizzle/fetch/fs YOK, bkz. paket başı
// kural) — bu yüzden hem sunucu (packages/db/src/queries/lab-results.ts
// abnormal hesaplaması) hem istemci (laboratuvar formu autofill + grafik
// referans bandı) tarafından güvenle içe aktarılabilir.
//
// ÖNEMLİ: bu referans değerleri GENEL YETİŞKİN popülasyonu için tipik
// aralıklardır, yaş/cinsiyet/laboratuvar cihazına göre değişebilir — burası
// SADECE diyetisyenin formu hızlı doldurabilmesi için bir BAŞLANGIÇ değeri,
// klinik karar değildir. Her kayıtta refMin/refMax elle override edilebilir
// (bkz. schema/health-records.ts labResults.refMin/refMax — kayıt bazlı,
// preset'e bağlı değil).
export interface LabAnalytePreset {
  code: string
  nameTr: string
  unit: string
  refMin: number | null
  refMax: number | null
}

export const LAB_ANALYTE_PRESETS: readonly LabAnalytePreset[] = [
  { code: 'aclik_glukoz', nameTr: 'Açlık glukozu', unit: 'mg/dL', refMin: 70, refMax: 99 },
  { code: 'hba1c', nameTr: 'HbA1c', unit: '%', refMin: 4, refMax: 5.6 },
  { code: 'tsh', nameTr: 'TSH', unit: 'mIU/L', refMin: 0.4, refMax: 4 },
  { code: 't3', nameTr: 'Serbest T3', unit: 'pg/mL', refMin: 2.3, refMax: 4.2 },
  { code: 't4', nameTr: 'Serbest T4', unit: 'ng/dL', refMin: 0.8, refMax: 1.8 },
  { code: 'total_kolesterol', nameTr: 'Total kolesterol', unit: 'mg/dL', refMin: null, refMax: 200 },
  { code: 'ldl_kolesterol', nameTr: 'LDL kolesterol', unit: 'mg/dL', refMin: null, refMax: 130 },
  { code: 'hdl_kolesterol', nameTr: 'HDL kolesterol', unit: 'mg/dL', refMin: 40, refMax: null },
  { code: 'trigliserit', nameTr: 'Trigliserit', unit: 'mg/dL', refMin: null, refMax: 150 },
  { code: 'ferritin', nameTr: 'Ferritin', unit: 'ng/mL', refMin: 20, refMax: 250 },
  { code: 'b12', nameTr: 'B12 vitamini', unit: 'pg/mL', refMin: 200, refMax: 900 },
  { code: 'vitamin_d', nameTr: 'D vitamini (25-OH)', unit: 'ng/mL', refMin: 20, refMax: 50 },
  { code: 'hemoglobin', nameTr: 'Hemoglobin', unit: 'g/dL', refMin: 12, refMax: 16 },
  { code: 'alt', nameTr: 'ALT', unit: 'U/L', refMin: 0, refMax: 41 },
  { code: 'ast', nameTr: 'AST', unit: 'U/L', refMin: 0, refMax: 40 },
  { code: 'kreatinin', nameTr: 'Kreatinin', unit: 'mg/dL', refMin: 0.6, refMax: 1.3 },
  { code: 'urik_asit', nameTr: 'Ürik asit', unit: 'mg/dL', refMin: 3.4, refMax: 7 },
] as const

export function findLabAnalytePreset(code: string): LabAnalytePreset | undefined {
  return LAB_ANALYTE_PRESETS.find((preset) => preset.code === code)
}

// GÖREV 2 — "isAbnormal (hesaplanır)": measurements.ts'teki BKİ/bel-kalça
// oranı ile AYNI desen (bkz. schema/measurements.ts dosya başı notu),
// isAbnormal bir DB SÜTUNU değil, değer + referans aralığından her okumada
// türetilen bir alan. Referans aralığı tanımsızsa (her iki uç da null)
// "anormal mi" sorusu cevaplanamaz — sessizce false DÖNMEZ, null döner
// (UI'da "referans aralığı girilmedi" olarak ayırt edilebilsin diye).
export function computeLabAbnormalStatus(
  value: number,
  refMin: number | null,
  refMax: number | null,
): boolean | null {
  if (refMin === null && refMax === null) return null
  if (refMin !== null && value < refMin) return true
  if (refMax !== null && value > refMax) return true
  return false
}
