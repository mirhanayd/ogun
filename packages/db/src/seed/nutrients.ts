import type { nutrientCategoryEnum, nutrientUnitEnum } from '../schema/foods'

type NutrientUnit = (typeof nutrientUnitEnum.enumValues)[number]
type NutrientCategory = (typeof nutrientCategoryEnum.enumValues)[number]

interface NutrientSeed {
  code: string
  nameTr: string
  nameEn: string
  unit: NutrientUnit
  category: NutrientCategory
  isCore: boolean
}

// isCore = true olanlar plan editöründeki canlı besin öğesi panelinde gösterilecek
// ~15 besin öğesi. Kodlar INFOODS/USDA tagname sözlüğüne yakın tutuldu ki BLS ve
// USDA eşleme dosyalarında (Hafta 1.3/1.4) doğrudan referans alınabilsin.
const nutrientSeeds: Omit<NutrientSeed, 'displayOrder'>[] = [
  // --- Core (~15) ---
  { code: 'ENERC_KCAL', nameTr: 'Enerji', nameEn: 'Energy', unit: 'kcal', category: 'makro', isCore: true },
  { code: 'PROCNT', nameTr: 'Protein', nameEn: 'Protein', unit: 'g', category: 'makro', isCore: true },
  { code: 'CHOCDF', nameTr: 'Karbonhidrat', nameEn: 'Carbohydrate', unit: 'g', category: 'makro', isCore: true },
  { code: 'FAT', nameTr: 'Yağ', nameEn: 'Fat', unit: 'g', category: 'makro', isCore: true },
  { code: 'FASAT', nameTr: 'Doymuş yağ', nameEn: 'Saturated fat', unit: 'g', category: 'yağ_asidi', isCore: true },
  { code: 'FIBTG', nameTr: 'Lif', nameEn: 'Fiber', unit: 'g', category: 'makro', isCore: true },
  { code: 'SUGAR', nameTr: 'Şeker', nameEn: 'Sugars', unit: 'g', category: 'makro', isCore: true },
  { code: 'NA', nameTr: 'Sodyum', nameEn: 'Sodium', unit: 'mg', category: 'mineral', isCore: true },
  { code: 'FE', nameTr: 'Demir', nameEn: 'Iron', unit: 'mg', category: 'mineral', isCore: true },
  { code: 'CA', nameTr: 'Kalsiyum', nameEn: 'Calcium', unit: 'mg', category: 'mineral', isCore: true },
  { code: 'ZN', nameTr: 'Çinko', nameEn: 'Zinc', unit: 'mg', category: 'mineral', isCore: true },
  { code: 'VITB12', nameTr: 'B12 vitamini', nameEn: 'Vitamin B12', unit: 'µg', category: 'vitamin', isCore: true },
  { code: 'FOL', nameTr: 'Folat', nameEn: 'Folate', unit: 'µg', category: 'vitamin', isCore: true },
  { code: 'VITD', nameTr: 'D vitamini', nameEn: 'Vitamin D', unit: 'µg', category: 'vitamin', isCore: true },
  { code: 'VITC', nameTr: 'C vitamini', nameEn: 'Vitamin C', unit: 'mg', category: 'vitamin', isCore: true },

  // --- Ek makro ---
  { code: 'ENERC_KJ', nameTr: 'Enerji (kJ)', nameEn: 'Energy (kJ)', unit: 'kJ', category: 'makro', isCore: false },
  { code: 'ALC', nameTr: 'Alkol', nameEn: 'Alcohol', unit: 'g', category: 'makro', isCore: false },

  // --- Yağ asitleri ---
  { code: 'FAMS', nameTr: 'Tekli doymamış yağ', nameEn: 'Monounsaturated fat', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'FAPU', nameTr: 'Çoklu doymamış yağ', nameEn: 'Polyunsaturated fat', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'FATRN', nameTr: 'Trans yağ', nameEn: 'Trans fat', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'F16D0', nameTr: 'Palmitik asit', nameEn: 'Palmitic acid', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'F18D0', nameTr: 'Stearik asit', nameEn: 'Stearic acid', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'F18D1', nameTr: 'Oleik asit', nameEn: 'Oleic acid', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'F18D2CN6', nameTr: 'Linoleik asit (omega-6)', nameEn: 'Linoleic acid', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'F18D3N3', nameTr: 'Alfa-linolenik asit (omega-3)', nameEn: 'Alpha-linolenic acid', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'F20D5N3', nameTr: 'EPA', nameEn: 'Eicosapentaenoic acid', unit: 'g', category: 'yağ_asidi', isCore: false },
  { code: 'F22D6N3', nameTr: 'DHA', nameEn: 'Docosahexaenoic acid', unit: 'g', category: 'yağ_asidi', isCore: false },

  // --- Ek vitaminler ---
  { code: 'VITA_RAE', nameTr: 'A vitamini', nameEn: 'Vitamin A', unit: 'µg', category: 'vitamin', isCore: false },
  { code: 'VITE', nameTr: 'E vitamini', nameEn: 'Vitamin E', unit: 'mg', category: 'vitamin', isCore: false },
  { code: 'VITK1', nameTr: 'K vitamini', nameEn: 'Vitamin K', unit: 'µg', category: 'vitamin', isCore: false },
  { code: 'THIA', nameTr: 'B1 vitamini (Tiamin)', nameEn: 'Thiamin', unit: 'mg', category: 'vitamin', isCore: false },
  { code: 'RIBF', nameTr: 'B2 vitamini (Riboflavin)', nameEn: 'Riboflavin', unit: 'mg', category: 'vitamin', isCore: false },
  { code: 'NIA', nameTr: 'B3 vitamini (Niasin)', nameEn: 'Niacin', unit: 'mg', category: 'vitamin', isCore: false },
  { code: 'PANTAC', nameTr: 'B5 vitamini (Pantotenik asit)', nameEn: 'Pantothenic acid', unit: 'mg', category: 'vitamin', isCore: false },
  { code: 'VITB6A', nameTr: 'B6 vitamini', nameEn: 'Vitamin B6', unit: 'mg', category: 'vitamin', isCore: false },
  { code: 'BIOT', nameTr: 'B7 vitamini (Biyotin)', nameEn: 'Biotin', unit: 'µg', category: 'vitamin', isCore: false },

  // --- Ek mineraller ---
  { code: 'MG', nameTr: 'Magnezyum', nameEn: 'Magnesium', unit: 'mg', category: 'mineral', isCore: false },
  { code: 'K', nameTr: 'Potasyum', nameEn: 'Potassium', unit: 'mg', category: 'mineral', isCore: false },
  { code: 'P', nameTr: 'Fosfor', nameEn: 'Phosphorus', unit: 'mg', category: 'mineral', isCore: false },
  { code: 'CU', nameTr: 'Bakır', nameEn: 'Copper', unit: 'mg', category: 'mineral', isCore: false },
  { code: 'MN', nameTr: 'Manganez', nameEn: 'Manganese', unit: 'mg', category: 'mineral', isCore: false },
  { code: 'SE', nameTr: 'Selenyum', nameEn: 'Selenium', unit: 'µg', category: 'mineral', isCore: false },
  { code: 'ID', nameTr: 'İyot', nameEn: 'Iodine', unit: 'µg', category: 'mineral', isCore: false },

  // --- Amino asitler ---
  { code: 'TRP', nameTr: 'Triptofan', nameEn: 'Tryptophan', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'THR', nameTr: 'Treonin', nameEn: 'Threonine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'ILE', nameTr: 'İzolösin', nameEn: 'Isoleucine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'LEU', nameTr: 'Lösin', nameEn: 'Leucine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'LYS', nameTr: 'Lizin', nameEn: 'Lysine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'MET', nameTr: 'Metionin', nameEn: 'Methionine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'PHE', nameTr: 'Fenilalanin', nameEn: 'Phenylalanine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'VAL', nameTr: 'Valin', nameEn: 'Valine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'HISTID', nameTr: 'Histidin', nameEn: 'Histidine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'ARG', nameTr: 'Arjinin', nameEn: 'Arginine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'CYS', nameTr: 'Sistein', nameEn: 'Cysteine', unit: 'g', category: 'amino_asit', isCore: false },
  { code: 'TYR', nameTr: 'Tirozin', nameEn: 'Tyrosine', unit: 'g', category: 'amino_asit', isCore: false },

  // --- Diğer ---
  { code: 'WATER', nameTr: 'Su', nameEn: 'Water', unit: 'g', category: 'diğer', isCore: false },
  { code: 'CHOLE', nameTr: 'Kolesterol', nameEn: 'Cholesterol', unit: 'mg', category: 'diğer', isCore: false },
  { code: 'CHOLN', nameTr: 'Kolin', nameEn: 'Choline', unit: 'mg', category: 'diğer', isCore: false },
  { code: 'CAFFN', nameTr: 'Kafein', nameEn: 'Caffeine', unit: 'mg', category: 'diğer', isCore: false },
  { code: 'ASH', nameTr: 'Kül', nameEn: 'Ash', unit: 'g', category: 'diğer', isCore: false },
]

export const nutrientsSeed = nutrientSeeds.map((nutrient, index) => ({
  ...nutrient,
  displayOrder: index,
}))
