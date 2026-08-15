import type { AgeGroupReference } from '../reference-comparison'

// ⚠ YER TUTUCU VERİ — GERÇEK TÜBER 2022 DEĞERLERİ DEĞİL.
//
// Bu dosya, TÜBER (Türkiye Beslenme Rehberi) 2022 referans değerleri elimize
// geçene kadar compareToReference() akışının yapısını test etmek için 3 örnek
// yaş grubuyla dolduruldu. Buradaki min/max sayıları TEMSİLİDİR, gerçek TÜBER
// yayınından alınmamıştır — beslenme tavsiyesi üretmek için KULLANILMAMALIDIR.
// Gerçek veri seti sağlandığında bu dosyanın tamamı değiştirilecek.
export const TUBER_2022_PLACEHOLDER: AgeGroupReference[] = [
  {
    ageGroupCode: 'ADULT_19_30_MALE',
    ageGroupLabel: '19-30 yaş, erkek (örnek/placeholder)',
    sex: 'male',
    ranges: [
      { nutrientCode: 'ENERC_KCAL', min: 2400, max: 2800, unit: 'kcal' },
      { nutrientCode: 'PROCNT', min: 56, max: null, unit: 'g' },
      { nutrientCode: 'CA', min: 1000, max: 2500, unit: 'mg' },
      { nutrientCode: 'FE', min: 8, max: 45, unit: 'mg' },
    ],
  },
  {
    ageGroupCode: 'ADULT_19_30_FEMALE',
    ageGroupLabel: '19-30 yaş, kadın (örnek/placeholder)',
    sex: 'female',
    ranges: [
      { nutrientCode: 'ENERC_KCAL', min: 1800, max: 2200, unit: 'kcal' },
      { nutrientCode: 'PROCNT', min: 46, max: null, unit: 'g' },
      { nutrientCode: 'CA', min: 1000, max: 2500, unit: 'mg' },
      { nutrientCode: 'FE', min: 18, max: 45, unit: 'mg' },
    ],
  },
  {
    ageGroupCode: 'CHILD_4_6',
    ageGroupLabel: '4-6 yaş, çocuk (örnek/placeholder)',
    sex: 'all',
    ranges: [
      { nutrientCode: 'ENERC_KCAL', min: 1200, max: 1600, unit: 'kcal' },
      { nutrientCode: 'PROCNT', min: 19, max: null, unit: 'g' },
      { nutrientCode: 'CA', min: 800, max: 2500, unit: 'mg' },
      { nutrientCode: 'FE', min: 7, max: 40, unit: 'mg' },
    ],
  },
]
