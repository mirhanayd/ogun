// BLS 4.0 Excel dosyasındaki besin öğesi sütunlarını bizim `nutrients.code`
// değerlerimize eşler.
//
// Gerçek BLS 4.0 dosyası (packages/etl/data/bls/bls-4.0.xlsx, 7.140 besin,
// 418 sütun) incelenerek dolduruldu. Her besin öğesinin BLS'teki "Datenherkunft"
// (veri kaynağı) sütunu ile eşleştirildi — bu sütun `isImputed`'i belirlemekte
// kullanılıyor (bkz. src/importers/bls.ts > classifyIsImputed).
//
// Kapsam notu: BLS'in seçtiğimiz 60 `nutrients` kaydına karşılık gelmeyen
// sütunları (ör. tekil şeker/organik asit/yağ asidi alt türleri, iz mineraller
// SE/CR/MO/FD, trans yağ toplamı, kolin, kafein) bilinçli olarak eşlenmedi —
// bunlar mevcut seed'imizde yok, ileride gerekirse nutrients seed'i genişletilip
// buraya eklenebilir. `pnpm etl:bls` çalıştırıldığında bunlar UNMAPPED olarak
// raporlanacak, bu beklenen bir durumdur.
//
// GÖZDEN GEÇİRME NOTU: Bu eşleme bir beslenme ve diyetetik mezunuyla birlikte
// doğrulanmalı (bkz. roadmap "Son Not").
export interface BlsNutrientMapping {
  /** packages/db seed'inde tanımlı nutrients.code değeri (ör. 'PROCNT') */
  nutrientCode: string
  /** BLS Excel'indeki değer sütununun TAM başlığı */
  valueColumn: string
  /** Bu değere özel "Datenherkunft" (veri kaynağı) sütunu varsa TAM başlığı */
  originColumn?: string
  /** Kaynak birimini nutrients seed'indeki kanonik birime dönüştüren çarpan. */
  valueMultiplier?: number
}

export const blsNutrientMap: BlsNutrientMapping[] = [
  {
    nutrientCode: 'ENERC_KCAL',
    valueColumn: 'ENERCC Energie (Kilokalorien) [kcal/100g]',
    originColumn: 'ENERCC Datenherkunft',
  },
  {
    nutrientCode: 'ENERC_KJ',
    valueColumn: 'ENERCJ Energie (Kilojoule) [kJ/100g]',
    originColumn: 'ENERCJ Datenherkunft',
  },
  {
    nutrientCode: 'WATER',
    valueColumn: 'WATER Wasser [g/100g]',
    originColumn: 'WATER Datenherkunft',
  },
  {
    nutrientCode: 'PROCNT',
    valueColumn: 'PROT625 Protein (Nx6,25) [g/100g]',
    originColumn: 'PROT625 Datenherkunft',
  },
  { nutrientCode: 'FAT', valueColumn: 'FAT Fett [g/100g]', originColumn: 'FAT Datenherkunft' },
  {
    nutrientCode: 'CHOCDF',
    valueColumn: 'CHO Kohlenhydrate, verfügbar [g/100g]',
    originColumn: 'CHO Datenherkunft',
  },
  {
    nutrientCode: 'FIBTG',
    valueColumn: 'FIBT Ballaststoffe, gesamt [g/100g]',
    originColumn: 'FIBT Datenherkunft',
  },
  {
    nutrientCode: 'ALC',
    valueColumn: 'ALC Alkohol (Ethanol) [g/100g]',
    originColumn: 'ALC Datenherkunft',
  },
  { nutrientCode: 'ASH', valueColumn: 'ASH Rohasche [g/100g]', originColumn: 'ASH Datenherkunft' },
  {
    nutrientCode: 'SUGAR',
    valueColumn: 'SUGAR Zucker (Mono- und Disaccharide), gesamt [g/100g]',
    originColumn: 'SUGAR Datenherkunft',
  },
  {
    nutrientCode: 'VITA_RAE',
    valueColumn: 'VITAA Vitamin A, Retinol-Aktivitäts-Äquivalent (RAE) [µg/100g]',
    originColumn: 'VITAA Datenherkunft',
  },
  {
    nutrientCode: 'VITD',
    valueColumn: 'VITD Vitamin D [µg/100g]',
    originColumn: 'VITD Datenherkunft',
  },
  {
    nutrientCode: 'VITE',
    valueColumn: 'VITE Vitamin E (Alpha-Tocopherol) [mg/100g]',
    originColumn: 'VITE Datenherkunft',
  },
  {
    nutrientCode: 'VITK1',
    valueColumn: 'VITK Vitamin K [µg/100g]',
    originColumn: 'VITK Datenherkunft',
  },
  {
    nutrientCode: 'THIA',
    valueColumn: 'THIA Vitamin B1 (Thiamin) [mg/100g]',
    originColumn: 'THIA Datenherkunft',
  },
  {
    nutrientCode: 'RIBF',
    valueColumn: 'RIBF Vitamin B2 (Riboflavin) [mg/100g]',
    originColumn: 'RIBF Datenherkunft',
  },
  { nutrientCode: 'NIA', valueColumn: 'NIA Niacin [mg/100g]', originColumn: 'NIA Datenherkunft' },
  {
    nutrientCode: 'PANTAC',
    valueColumn: 'PANTAC Pantothensäure [mg/100g]',
    originColumn: 'PANTAC Datenherkunft',
  },
  {
    nutrientCode: 'VITB6A',
    valueColumn: 'VITB6 Vitamin B6 [µg/100g]',
    originColumn: 'VITB6 Datenherkunft',
    valueMultiplier: 0.001,
  },
  {
    nutrientCode: 'BIOT',
    valueColumn: 'BIOT Biotin [µg/100g]',
    originColumn: 'BIOT Datenherkunft',
  },
  {
    nutrientCode: 'FOL',
    valueColumn: 'FOL Folat-Äquivalent [µg/100g]',
    originColumn: 'FOL Datenherkunft',
  },
  {
    nutrientCode: 'VITB12',
    valueColumn: 'VITB12 Vitamin B12 (Cobalamine) [µg/100g]',
    originColumn: 'VITB12 Datenherkunft',
  },
  {
    nutrientCode: 'VITC',
    valueColumn: 'VITC Vitamin C [mg/100g]',
    originColumn: 'VITC Datenherkunft',
  },
  { nutrientCode: 'NA', valueColumn: 'NA Natrium [mg/100g]', originColumn: 'NA Datenherkunft' },
  { nutrientCode: 'K', valueColumn: 'K Kalium [mg/100g]', originColumn: 'K Datenherkunft' },
  { nutrientCode: 'CA', valueColumn: 'CA Calcium [mg/100g]', originColumn: 'CA Datenherkunft' },
  { nutrientCode: 'MG', valueColumn: 'MG Magnesium [mg/100g]', originColumn: 'MG Datenherkunft' },
  { nutrientCode: 'P', valueColumn: 'P Phosphor [mg/100g]', originColumn: 'P Datenherkunft' },
  { nutrientCode: 'FE', valueColumn: 'FE Eisen [mg/100g]', originColumn: 'FE Datenherkunft' },
  { nutrientCode: 'ZN', valueColumn: 'ZN Zink [mg/100g]', originColumn: 'ZN Datenherkunft' },
  { nutrientCode: 'ID', valueColumn: 'ID Iodid [µg/100g]', originColumn: 'ID Datenherkunft' },
  {
    nutrientCode: 'CU',
    valueColumn: 'CU Kupfer [µg/100g]',
    originColumn: 'CU Datenherkunft',
    valueMultiplier: 0.001,
  },
  {
    nutrientCode: 'MN',
    valueColumn: 'MN Mangan [µg/100g]',
    originColumn: 'MN Datenherkunft',
    valueMultiplier: 0.001,
  },
  {
    nutrientCode: 'FASAT',
    valueColumn: 'FASAT Fettsäuren, gesättigt, gesamt [g/100g]',
    originColumn: 'FASAT Datenherkunft',
  },
  {
    nutrientCode: 'F16D0',
    valueColumn: 'F16:0 Fettsäure C16:0 (Palmitinsäure) [g/100g]',
    originColumn: 'F16:0 Datenherkunft',
  },
  {
    nutrientCode: 'F18D0',
    valueColumn: 'F18:0 Fettsäure C18:0 (Stearinsäure) [g/100g]',
    originColumn: 'F18:0 Datenherkunft',
  },
  {
    nutrientCode: 'FAMS',
    valueColumn: 'FAMS Fettsäure, einfach ungesättigt, gesamt [g/100g]',
    originColumn: 'FAMS Datenherkunft',
  },
  {
    nutrientCode: 'F18D1',
    valueColumn: 'F18:1CN9 Fettsäure C18:1 n-9 cis (Ölsäure) [g/100g]',
    originColumn: 'F18:1CN9 Datenherkunft',
  },
  {
    nutrientCode: 'FAPU',
    valueColumn: 'FAPU Fettsäuren, mehrfach ungesättigt, gesamt [g/100g]',
    originColumn: 'FAPU Datenherkunft',
  },
  {
    nutrientCode: 'F18D2CN6',
    valueColumn: 'F18:2CN6 Fettsäure C18:2 n-6 cis, cis (Linolsäure) [g/100g]',
    originColumn: 'F18:2CN6 Datenherkunft',
  },
  {
    nutrientCode: 'F18D3N3',
    valueColumn: 'F18:3CN3 Fettsäure C18:3 n-3 all-cis (Alpha-Linolensäure) [g/100g]',
    originColumn: 'F18:3CN3 Datenherkunft',
  },
  {
    nutrientCode: 'F20D5N3',
    valueColumn: 'F20:5CN3 Fettsäure C20:5 n-3 all-cis (Eicosapentaensäure) [g/100g]',
    originColumn: 'F20:5CN3 Datenherkunft',
  },
  {
    nutrientCode: 'F22D6N3',
    valueColumn: 'F22:6CN3 Fettsäure C22:6 n-3 all-cis (Docosahexaensäure) [g/100g]',
    originColumn: 'F22:6CN3 Datenherkunft',
  },
  {
    nutrientCode: 'CHOLE',
    valueColumn: 'CHORL Cholesterin [mg/100g]',
    originColumn: 'CHORL Datenherkunft',
  },
  { nutrientCode: 'ARG', valueColumn: 'ARG Arginin [g/100g]', originColumn: 'ARG Datenherkunft' },
  {
    nutrientCode: 'CYS',
    valueColumn: 'CYSTE Cystein [g/100g]',
    originColumn: 'CYSTE Datenherkunft',
  },
  {
    nutrientCode: 'HISTID',
    valueColumn: 'HIS Histidin [g/100g]',
    originColumn: 'HIS Datenherkunft',
  },
  { nutrientCode: 'ILE', valueColumn: 'ILE Isoleucin [g/100g]', originColumn: 'ILE Datenherkunft' },
  { nutrientCode: 'LEU', valueColumn: 'LEU Leucin [g/100g]', originColumn: 'LEU Datenherkunft' },
  { nutrientCode: 'LYS', valueColumn: 'LYS Lysin [g/100g]', originColumn: 'LYS Datenherkunft' },
  { nutrientCode: 'MET', valueColumn: 'MET Methionin [g/100g]', originColumn: 'MET Datenherkunft' },
  {
    nutrientCode: 'PHE',
    valueColumn: 'PHE Phenylalanin [g/100g]',
    originColumn: 'PHE Datenherkunft',
  },
  { nutrientCode: 'THR', valueColumn: 'THR Threonin [g/100g]', originColumn: 'THR Datenherkunft' },
  {
    nutrientCode: 'TRP',
    valueColumn: 'TRP Tryptophan [g/100g]',
    originColumn: 'TRP Datenherkunft',
  },
  { nutrientCode: 'TYR', valueColumn: 'TYR Tyrosin [g/100g]', originColumn: 'TYR Datenherkunft' },
  { nutrientCode: 'VAL', valueColumn: 'VAL Valin [g/100g]', originColumn: 'VAL Datenherkunft' },
]
