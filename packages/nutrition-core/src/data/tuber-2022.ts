import type { AgeGroupReference } from '../reference-comparison'

// ⚠ YER TUTUCU VERİ — GERÇEK TÜBER 2022 DEĞERLERİ DEĞİL.
//
// Bu dosya, TÜBER (Türkiye Beslenme Rehberi) 2022 referans değerleri elimize
// geçene kadar compareToReference()/classifyNutrientLevel() akışının
// yapısını test etmek için örnek yaş gruplarıyla dolduruldu. Buradaki
// min/max sayıları TEMSİLİDİR (genel literatürdeki DRI/RDA/UL değerlerine
// yakın kaba yuvarlamalar), gerçek TÜBER yayınından alınmamıştır — beslenme
// tavsiyesi üretmek için KULLANILMAMALIDIR. Gerçek veri seti sağlandığında
// bu dosyanın tamamı değiştirilecek.
//
// GitHub issue #26 / Prompt 5.4, GÖREV 2 — canlı besin öğesi panelinin
// mikro besin öğesi listesi isCore=true olan ~15 besin öğesi için referans
// gösterdiğinden, buradaki her yaş grubu artık o 15 kodun TAMAMINI
// (packages/db/src/seed/nutrients.ts'teki "Core" listesiyle aynı sırada)
// içeriyor — önceki sürüm sadece 4 kodla (kcal/protein/kalsiyum/demir)
// sınırlıydı.
export const TUBER_2022_PLACEHOLDER: AgeGroupReference[] = [
  {
    ageGroupCode: 'ADULT_19_30_MALE',
    ageGroupLabel: '19-30 yaş, erkek (örnek/placeholder)',
    sex: 'male',
    minAge: 19,
    maxAge: 30,
    ranges: [
      { nutrientCode: 'ENERC_KCAL', min: 2400, max: 2800, unit: 'kcal' },
      { nutrientCode: 'PROCNT', min: 56, max: null, unit: 'g' },
      { nutrientCode: 'CHOCDF', min: 130, max: null, unit: 'g' },
      { nutrientCode: 'FAT', min: null, max: 97, unit: 'g' },
      { nutrientCode: 'FASAT', min: null, max: 31, unit: 'g' },
      { nutrientCode: 'FIBTG', min: 38, max: null, unit: 'g' },
      { nutrientCode: 'SUGAR', min: null, max: 70, unit: 'g' },
      { nutrientCode: 'NA', min: 1500, max: 2300, unit: 'mg' },
      { nutrientCode: 'FE', min: 8, max: 45, unit: 'mg' },
      { nutrientCode: 'CA', min: 1000, max: 2500, unit: 'mg' },
      { nutrientCode: 'ZN', min: 11, max: 40, unit: 'mg' },
      { nutrientCode: 'VITB12', min: 2.4, max: null, unit: 'µg' },
      { nutrientCode: 'FOL', min: 400, max: 1000, unit: 'µg' },
      { nutrientCode: 'VITD', min: 15, max: 100, unit: 'µg' },
      { nutrientCode: 'VITC', min: 90, max: 2000, unit: 'mg' },
    ],
  },
  {
    ageGroupCode: 'ADULT_19_30_FEMALE',
    ageGroupLabel: '19-30 yaş, kadın (örnek/placeholder)',
    sex: 'female',
    minAge: 19,
    maxAge: 30,
    ranges: [
      { nutrientCode: 'ENERC_KCAL', min: 1800, max: 2200, unit: 'kcal' },
      { nutrientCode: 'PROCNT', min: 46, max: null, unit: 'g' },
      { nutrientCode: 'CHOCDF', min: 130, max: null, unit: 'g' },
      { nutrientCode: 'FAT', min: null, max: 78, unit: 'g' },
      { nutrientCode: 'FASAT', min: null, max: 24, unit: 'g' },
      { nutrientCode: 'FIBTG', min: 25, max: null, unit: 'g' },
      { nutrientCode: 'SUGAR', min: null, max: 55, unit: 'g' },
      { nutrientCode: 'NA', min: 1500, max: 2300, unit: 'mg' },
      { nutrientCode: 'FE', min: 18, max: 45, unit: 'mg' },
      { nutrientCode: 'CA', min: 1000, max: 2500, unit: 'mg' },
      { nutrientCode: 'ZN', min: 8, max: 40, unit: 'mg' },
      { nutrientCode: 'VITB12', min: 2.4, max: null, unit: 'µg' },
      { nutrientCode: 'FOL', min: 400, max: 1000, unit: 'µg' },
      { nutrientCode: 'VITD', min: 15, max: 100, unit: 'µg' },
      { nutrientCode: 'VITC', min: 75, max: 2000, unit: 'mg' },
    ],
  },
  {
    ageGroupCode: 'CHILD_4_6',
    ageGroupLabel: '4-6 yaş, çocuk (örnek/placeholder)',
    sex: 'all',
    minAge: 4,
    maxAge: 6,
    ranges: [
      { nutrientCode: 'ENERC_KCAL', min: 1200, max: 1600, unit: 'kcal' },
      { nutrientCode: 'PROCNT', min: 19, max: null, unit: 'g' },
      { nutrientCode: 'CHOCDF', min: 130, max: null, unit: 'g' },
      { nutrientCode: 'FAT', min: null, max: 62, unit: 'g' },
      { nutrientCode: 'FASAT', min: null, max: 18, unit: 'g' },
      { nutrientCode: 'FIBTG', min: 19, max: null, unit: 'g' },
      { nutrientCode: 'SUGAR', min: null, max: 40, unit: 'g' },
      { nutrientCode: 'NA', min: 1000, max: 1900, unit: 'mg' },
      { nutrientCode: 'FE', min: 7, max: 40, unit: 'mg' },
      { nutrientCode: 'CA', min: 800, max: 2500, unit: 'mg' },
      { nutrientCode: 'ZN', min: 5, max: 7, unit: 'mg' },
      { nutrientCode: 'VITB12', min: 1.2, max: null, unit: 'µg' },
      { nutrientCode: 'FOL', min: 200, max: 300, unit: 'µg' },
      { nutrientCode: 'VITD', min: 15, max: 63, unit: 'µg' },
      { nutrientCode: 'VITC', min: 25, max: 400, unit: 'mg' },
    ],
  },
]
