// BLS 4.0 Excel dosyasındaki besin öğesi sütunlarını bizim `nutrients.code`
// değerlerimize eşler.
//
// BİLİNÇLİ OLARAK BOŞ BAŞLIYOR. BLS 4.0'ın gerçek sütun başlıklarını görmeden
// bu eşlemeyi tahmin etmiyoruz — yanlış eşleme, ürünün sessizce yanlış besin
// öğesi hesabı yapmasına yol açar ve aylarca fark edilmeyebilir.
//
// Doldurma adımları:
// 1. `pnpm etl:bls:headers` çalıştır — BLS Excel dosyasındaki tüm sütun
//    başlıklarını konsola listeler.
// 2. Her besin öğesi sütununu (ve varsa "Datenherkunft" eşleniğini) burada
//    aşağıdaki formatta eşle.
// 3. Eşlemeyi bir beslenme ve diyetetik mezunuyla birlikte gözden geçir
//    (bkz. roadmap "Son Not" — bu, projenin en riskli adımlarından biri).
//
// Örnek:
// { nutrientCode: 'ENERC_KCAL', valueColumn: 'GCAL', originColumn: 'GCAL_Herkunft' },
export interface BlsNutrientMapping {
  /** packages/db seed'inde tanımlı nutrients.code değeri (ör. 'PROCNT') */
  nutrientCode: string
  /** BLS Excel'indeki değer sütununun TAM başlığı */
  valueColumn: string
  /** Bu değere özel "Datenherkunft" (veri kaynağı) sütunu varsa TAM başlığı */
  originColumn?: string
}

export const blsNutrientMap: BlsNutrientMapping[] = []
