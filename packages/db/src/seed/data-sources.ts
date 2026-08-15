import type { dataSourceCodeEnum } from '../schema/foods'

type DataSourceCode = (typeof dataSourceCodeEnum.enumValues)[number]

interface DataSourceSeed {
  code: DataSourceCode
  name: string
  priority: number
  license?: string
}

// Kaynak önceliği: çakışan besin öğesi değerlerinde büyük priority kazanır
// (bkz. packages/etl/src/lib/merge.ts). BLS4, USDA_FDN ve USDA_SR importer'lar
// kendi çalıştıklarında bu satırları atıf/lisans bilgisiyle güncelliyor
// (onConflictDoUpdate) — burası sadece öncelik sırasını ve importer henüz
// yazılmamış kaynakları (TURKOMP, OFF, CUSTOM) baştan kaydediyor.
export const dataSourcesSeed: DataSourceSeed[] = [
  { code: 'TURKOMP', name: 'TürKomp (Türkiye Gıda Kompozisyon Veri Tabanı)', priority: 100 },
  { code: 'BLS4', name: 'Bundeslebensmittelschlüssel', priority: 80, license: 'CC BY 4.0' },
  { code: 'USDA_FDN', name: 'USDA FoodData Central — Foundation Foods', priority: 60 },
  { code: 'USDA_SR', name: 'USDA FoodData Central — SR Legacy', priority: 40 },
  { code: 'OFF', name: 'Open Food Facts', priority: 20, license: 'ODbL' },
  { code: 'CUSTOM', name: 'Klinik/kullanıcı tanımlı besin', priority: 10 },
]
