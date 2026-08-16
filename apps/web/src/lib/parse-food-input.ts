// GitHub issue #24 / Prompt 5.2 GÖREV 2 — doğal dil miktar ayrıştırma.
//
// Amaç: diyetisyenin FoodSearchInput'a yazdığı serbest metni ("1 kase
// mercimek çorbası", "150 gr tavuk göğsü") tek bir alan gibi kullanabilmesi
// — miktar, birim/porsiyon ve asıl besin adı burada AYRIŞTIRILIR, gerçek arama
// (searchFoodsOffline, bkz. lib/food-index.ts) SADECE `query` alanıyla
// çağrılır. Bu dosya SAF fonksiyon içerir, DB/React'a bağımlı değildir —
// hem apps/web hem de (ileride gerekirse) başka bir paket içinden test
// edilebilir olsun diye.
//
// KAPSAM DIŞI (bilerek basit tutuldu): "bir buçuk", "üç dört tane" gibi bileşik
// sayı sözcükleri, saat/dakika gibi zaman ifadeleri, birden fazla besinin tek
// satırda yazılması ("1 elma 2 muz"). Roadmap GÖREV 2 bunları istemiyor —
// ihtiyaç doğarsa ayrı bir issue'da genişletilir.

export interface ParsedFoodInput {
  // Ayrıştırılamayan/verilmeyen miktar için varsayılan 1 döner — "elma" gibi
  // sade bir girdi de arama yapılabilsin diye (miktar girmemiş = "1 adet"
  // varsayımı, FoodSearchInput miktar alanını yine de düzenlenebilir bırakır).
  amount: number
  // Sadece "gr/gram/g/kg/ml/lt/litre/l" gibi GERÇEK ölçü birimleri.
  unit?: 'g' | 'kg' | 'ml' | 'l'
  // "kase", "bardak", "yemek kaşığı", "orta boy" gibi ev ölçüsü/tanımlayıcı —
  // food_portions.label ile TAM eşleşmesi garanti değil (kullanıcı serbest
  // yazıyor), FoodSearchInput bunu sonradan en yakın porsiyonla eşleştirir.
  portion?: string
  // Aramaya gidecek, miktar/birim/porsiyon sözcüklerinden arındırılmış besin adı.
  query: string
}

// Türkçe sayı sözcükleri — GÖREV 2'nin açıkça istediği liste: "yarım, çeyrek,
// bir, iki, üç...". 20'ye kadar ve onluk basamaklar (yirmi, otuz...) pratik
// kullanım için eklendi, roadmap örneklerinin tamamı 10'un altında olsa da
// "10 adet" gibi girdiler de karşılanabilsin diye.
const NUMBER_WORDS: Record<string, number> = {
  yarım: 0.5,
  çeyrek: 0.25,
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
  onbir: 11,
  oniki: 12,
  yirmi: 20,
  otuz: 30,
}

const UNIT_WORDS: Record<string, ParsedFoodInput['unit']> = {
  g: 'g',
  gr: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilogram: 'kg',
  ml: 'ml',
  mililitre: 'ml',
  l: 'l',
  lt: 'l',
  litre: 'l',
}

// Çok kelimeli olanlar ÖNCE denenmeli ("su bardağı" "bardak"tan önce
// eşleşmezse "su" query'de garip bir artık olarak kalır) — bu yüzden dizi
// uzunluğa göre azalan sırada tutuluyor (bkz. matchPortion).
const PORTION_PHRASES = [
  'su bardağı',
  'çay bardağı',
  'yemek kaşığı',
  'tatlı kaşığı',
  'çay kaşığı',
  'orta boy',
  'küçük boy',
  'büyük boy',
  'bardak',
  'kase',
  'kaşık',
  'dilim',
  'porsiyon',
  'avuç',
  'tabak',
  'adet',
  'kutu',
  'paket',
  'dal',
  'diş',
  'demet',
  'salkım',
].sort((a, b) => b.length - a.length)

function parseAmountToken(token: string): number | null {
  const normalized = token.replace(',', '.')
  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized)
  }
  return NUMBER_WORDS[token] ?? null
}

// Girdinin başındaki miktarı (sayı ya da Türkçe sayı sözcüğü) tüketir.
// Eşleşme yoksa amount=1 varsayımıyla girdiyi OLDUĞU GİBİ döner.
function stripAmount(words: string[]): { amount: number; rest: string[] } {
  if (words.length === 0) return { amount: 1, rest: words }
  const amount = parseAmountToken(words[0]!)
  if (amount === null) return { amount: 1, rest: words }
  return { amount, rest: words.slice(1) }
}

// Kalan sözcüklerin başında bir birim (gr/ml/kg/l) var mı diye bakar.
function stripUnit(words: string[]): { unit?: ParsedFoodInput['unit']; rest: string[] } {
  if (words.length === 0) return { rest: words }
  const unit = UNIT_WORDS[words[0]!]
  if (!unit) return { rest: words }
  return { unit, rest: words.slice(1) }
}

// Kalan sözcüklerin başında bir porsiyon ifadesi (tek veya çok kelimeli) var
// mı diye bakar — en uzun eşleşen ifade kazanır.
function stripPortion(words: string[]): { portion?: string; rest: string[] } {
  for (const phrase of PORTION_PHRASES) {
    const phraseWords = phrase.split(' ')
    if (phraseWords.length > words.length) continue
    const candidate = words.slice(0, phraseWords.length).join(' ')
    if (candidate === phrase) {
      return { portion: phrase, rest: words.slice(phraseWords.length) }
    }
  }
  return { rest: words }
}

export function parseFoodInput(input: string): ParsedFoodInput {
  // "tr" locale ile küçük harfe çevrilir — "İ" → "i" değil "İ" → "i̇" gibi
  // sürprizlere yol açan İngilizce toLowerCase() yerine (bkz. lib/normalize.ts
  // ile aynı gerekçe: Türkçe I/İ çifti standart Unicode kurallarında farklı davranır).
  const trimmed = input.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR')
  if (trimmed === '') {
    return { amount: 1, query: '' }
  }

  const words = trimmed.split(' ')
  const { amount, rest: afterAmount } = stripAmount(words)
  const { unit, rest: afterUnit } = stripUnit(afterAmount)

  // Birim zaten bulunduysa ("150 gr tavuk göğsü") ayrıca porsiyon aranmaz —
  // "gr" ve "kase" aynı anda anlamlı değil, ikisi de "150 gr kase tavuk"
  // gibi anlamsız bir ayrıştırmaya yol açardı.
  const { portion, rest: afterPortion } = unit ? { portion: undefined, rest: afterUnit } : stripPortion(afterUnit)

  const query = afterPortion.join(' ').trim()

  return {
    amount,
    ...(unit ? { unit } : {}),
    ...(portion ? { portion } : {}),
    query,
  }
}
