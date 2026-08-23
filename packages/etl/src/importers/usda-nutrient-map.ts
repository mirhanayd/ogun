// USDA FoodData Central'ın nutrient.csv'sindeki sayısal nutrient_id'lerini bizim
// `nutrients.code` değerlerimize eşler.
//
// Gerçek USDA "Full Download" paketi (packages/etl/data/usda/nutrient.csv, 477 satır)
// incelenerek dolduruldu — `pnpm etl:usda:nutrients` çıktısıyla tek tek doğrulandı.
// 60 seed'lediğimiz besin öğesinin TAMAMI USDA'da karşılık buluyor (BLS'te eksik olan
// trans yağ/selenyum/kolin/kafein bile burada var).
//
// Not: USDA aynı besin öğesi için birden fazla ölçüm/alt tür sunduğunda (ör. Vitamin D
// hem IU hem µg, B6 hem toplam hem alt formlar, 18:1/18:2 hem genel hem izomer bazlı),
// birimimizle eşleşen ve en genel/standart sayılan sütun seçildi. Alt türler bilinçli
// olarak eşlenmedi.
//
// GÖZDEN GEÇİRME NOTU: Bu eşleme bir beslenme ve diyetetik mezunuyla birlikte
// doğrulanmalı (bkz. roadmap "Son Not").
export interface UsdaNutrientMapping {
  /** packages/db seed'inde tanımlı nutrients.code değeri (ör. 'PROCNT') */
  nutrientCode: string
  /** USDA nutrient.csv'deki sayısal id */
  usdaNutrientId: number
  /** Aynı kanonik öğeye birden çok USDA satırı düşerse büyük değer tercih edilir. */
  preference?: number
}

export const usdaNutrientMap: UsdaNutrientMapping[] = [
  // Foundation Foods, Ekim 2020'den beri eski 1008 yerine 2047/2048 kullanıyor.
  // Besine özel Atwater faktörü varsa onu; yoksa genel faktörü; en son eski 1008'i seç.
  { nutrientCode: 'ENERC_KCAL', usdaNutrientId: 1008, preference: 10 }, // Legacy energy
  { nutrientCode: 'ENERC_KCAL', usdaNutrientId: 2047, preference: 20 }, // Atwater general
  { nutrientCode: 'ENERC_KCAL', usdaNutrientId: 2048, preference: 30 }, // Atwater specific
  { nutrientCode: 'ENERC_KJ', usdaNutrientId: 1062 }, // Energy
  { nutrientCode: 'WATER', usdaNutrientId: 1051 }, // Water
  { nutrientCode: 'PROCNT', usdaNutrientId: 1003 }, // Protein
  { nutrientCode: 'FAT', usdaNutrientId: 1004 }, // Total lipid (fat)
  { nutrientCode: 'CHOCDF', usdaNutrientId: 1005 }, // Carbohydrate, by difference
  { nutrientCode: 'FIBTG', usdaNutrientId: 1079 }, // Fiber, total dietary
  { nutrientCode: 'ALC', usdaNutrientId: 1018 }, // Alcohol, ethyl
  { nutrientCode: 'ASH', usdaNutrientId: 1007 }, // Ash
  { nutrientCode: 'SUGAR', usdaNutrientId: 1063 }, // Sugars, Total
  { nutrientCode: 'VITA_RAE', usdaNutrientId: 1106 }, // Vitamin A, RAE
  { nutrientCode: 'VITD', usdaNutrientId: 1114 }, // Vitamin D (D2 + D3)
  { nutrientCode: 'VITE', usdaNutrientId: 1109 }, // Vitamin E (alpha-tocopherol)
  { nutrientCode: 'VITK1', usdaNutrientId: 1185 }, // Vitamin K (phylloquinone)
  { nutrientCode: 'THIA', usdaNutrientId: 1165 }, // Thiamin
  { nutrientCode: 'RIBF', usdaNutrientId: 1166 }, // Riboflavin
  { nutrientCode: 'NIA', usdaNutrientId: 1167 }, // Niacin
  { nutrientCode: 'PANTAC', usdaNutrientId: 1170 }, // Pantothenic acid
  { nutrientCode: 'VITB6A', usdaNutrientId: 1175 }, // Vitamin B-6
  { nutrientCode: 'BIOT', usdaNutrientId: 1176 }, // Biotin
  { nutrientCode: 'FOL', usdaNutrientId: 1190 }, // Folate, DFE
  { nutrientCode: 'VITB12', usdaNutrientId: 1178 }, // Vitamin B-12
  { nutrientCode: 'VITC', usdaNutrientId: 1162 }, // Vitamin C, total ascorbic acid
  { nutrientCode: 'NA', usdaNutrientId: 1093 }, // Sodium, Na
  { nutrientCode: 'K', usdaNutrientId: 1092 }, // Potassium, K
  { nutrientCode: 'CA', usdaNutrientId: 1087 }, // Calcium, Ca
  { nutrientCode: 'MG', usdaNutrientId: 1090 }, // Magnesium, Mg
  { nutrientCode: 'P', usdaNutrientId: 1091 }, // Phosphorus, P
  { nutrientCode: 'FE', usdaNutrientId: 1089 }, // Iron, Fe
  { nutrientCode: 'ZN', usdaNutrientId: 1095 }, // Zinc, Zn
  { nutrientCode: 'ID', usdaNutrientId: 1100 }, // Iodine, I
  { nutrientCode: 'CU', usdaNutrientId: 1098 }, // Copper, Cu
  { nutrientCode: 'MN', usdaNutrientId: 1101 }, // Manganese, Mn
  { nutrientCode: 'SE', usdaNutrientId: 1103 }, // Selenium, Se
  { nutrientCode: 'FASAT', usdaNutrientId: 1258 }, // Fatty acids, total saturated
  { nutrientCode: 'F16D0', usdaNutrientId: 1265 }, // SFA 16:0
  { nutrientCode: 'F18D0', usdaNutrientId: 1266 }, // SFA 18:0
  { nutrientCode: 'FAMS', usdaNutrientId: 1292 }, // Fatty acids, total monounsaturated
  { nutrientCode: 'F18D1', usdaNutrientId: 1268 }, // MUFA 18:1
  { nutrientCode: 'FAPU', usdaNutrientId: 1293 }, // Fatty acids, total polyunsaturated
  { nutrientCode: 'F18D2CN6', usdaNutrientId: 1316 }, // PUFA 18:2 n-6 c,c
  { nutrientCode: 'F18D3N3', usdaNutrientId: 1404 }, // PUFA 18:3 n-3 c,c,c (ALA)
  { nutrientCode: 'F20D5N3', usdaNutrientId: 1278 }, // PUFA 20:5 n-3 (EPA)
  { nutrientCode: 'F22D6N3', usdaNutrientId: 1272 }, // PUFA 22:6 n-3 (DHA)
  { nutrientCode: 'FATRN', usdaNutrientId: 1257 }, // Fatty acids, total trans
  { nutrientCode: 'CHOLE', usdaNutrientId: 1253 }, // Cholesterol
  { nutrientCode: 'CHOLN', usdaNutrientId: 1180 }, // Choline, total
  { nutrientCode: 'CAFFN', usdaNutrientId: 1057 }, // Caffeine
  { nutrientCode: 'ARG', usdaNutrientId: 1220 }, // Arginine
  { nutrientCode: 'CYS', usdaNutrientId: 1216 }, // Cystine
  { nutrientCode: 'HISTID', usdaNutrientId: 1221 }, // Histidine
  { nutrientCode: 'ILE', usdaNutrientId: 1212 }, // Isoleucine
  { nutrientCode: 'LEU', usdaNutrientId: 1213 }, // Leucine
  { nutrientCode: 'LYS', usdaNutrientId: 1214 }, // Lysine
  { nutrientCode: 'MET', usdaNutrientId: 1215 }, // Methionine
  { nutrientCode: 'PHE', usdaNutrientId: 1217 }, // Phenylalanine
  { nutrientCode: 'THR', usdaNutrientId: 1211 }, // Threonine
  { nutrientCode: 'TRP', usdaNutrientId: 1210 }, // Tryptophan
  { nutrientCode: 'TYR', usdaNutrientId: 1218 }, // Tyrosine
  { nutrientCode: 'VAL', usdaNutrientId: 1219 }, // Valine
]
