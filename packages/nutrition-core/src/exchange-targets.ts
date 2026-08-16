// GitHub issue #28 / Prompt 5.6 — GÖREV 2: "Değişim hedefleri paneli...
// Hedefler danışanın kalori ve makro hedefinden türetilsin (klasik diyabet
// değişim dağılımı tablosunu referans al)".
//
// KURAL (bu paketin geneli): saf TypeScript, React/Next/DB/I-O yok.
//
// packages/db/src/schema/exchanges.ts'teki exchangeGroupCodeEnum ile BİREBİR
// aynı değer kümesi — o dosya drizzle-orm'a bağımlı olduğu için burada
// (plan-schemas.ts/client-schemas.ts'teki "tip-only tekrar" deseniyle AYNI
// gerekçeyle) tekrar tanımlanıyor, nutrition-core hiçbir DB paketine
// bağımlı OLMASIN diye.
export type ExchangeGroupCode = 'EKMEK' | 'ET' | 'SUT' | 'MEYVE' | 'SEBZE' | 'YAG'

export const EXCHANGE_GROUP_CODES: readonly ExchangeGroupCode[] = [
  'EKMEK',
  'ET',
  'SUT',
  'MEYVE',
  'SEBZE',
  'YAG',
]

export type ExchangeTargetCounts = Record<ExchangeGroupCode, number>

interface ExchangeDistributionAnchor {
  kcalLevel: number
  targets: ExchangeTargetCounts
}

// Türk diyetetik pratiğinde yaygın kullanılan "klasik diyabet değişim
// listesi" dağılım tablosu — BDPD (Beslenme Diyetisyenler Derneği) diyabet
// değişim listeleri ve genel klinik pratikte kullanılan kalori
// basamaklarından (1200-2800 kcal) uyarlanmıştır. exchange-groups.ts
// seed'indeki notla AYNI uyarı geçerli: "bir diyetisyenle birlikte
// doğrulanmalı" — burası KESİN bir klinik reçete değil, panelin "hedef"
// sütununu doldurmak için makul bir BAŞLANGIÇ noktası. Diyetisyen paneldeki
// hedefleri kendi klinik değerlendirmesine göre serbestçe değiştirebilir
// (bkz. exchange-panel.tsx GÖREV 2 — hedef sütunu salt-okunur DEĞİL).
//
// Neden burada (nutrition-core) ve neden 7 sabit basamak: distribution.ts
// MACRO_DISTRIBUTION_TARGET_RANGES'in AYNI dosyada yaşadığı gerekçeyle
// (genel, danışana özel OLMAYAN referans tablo) — deriveExchangeTargets
// ara kalori değerleri için bu basamaklar arasında DOĞRUSAL interpolasyon
// yapar (aşağıya bkz.), bu yüzden 7 nokta yeterli çözünürlük sağlıyor.
const EXCHANGE_DISTRIBUTION_TABLE: ExchangeDistributionAnchor[] = [
  {
    kcalLevel: 1200,
    targets: { EKMEK: 5, ET: 4, SUT: 2, MEYVE: 3, SEBZE: 4, YAG: 3 },
  },
  {
    kcalLevel: 1500,
    targets: { EKMEK: 7, ET: 5, SUT: 2, MEYVE: 3, SEBZE: 4, YAG: 4 },
  },
  {
    kcalLevel: 1800,
    targets: { EKMEK: 9, ET: 6, SUT: 3, MEYVE: 4, SEBZE: 4, YAG: 5 },
  },
  {
    kcalLevel: 2000,
    targets: { EKMEK: 10, ET: 6, SUT: 3, MEYVE: 4, SEBZE: 5, YAG: 6 },
  },
  {
    kcalLevel: 2200,
    targets: { EKMEK: 11, ET: 7, SUT: 3, MEYVE: 5, SEBZE: 5, YAG: 6 },
  },
  {
    kcalLevel: 2500,
    targets: { EKMEK: 13, ET: 8, SUT: 3, MEYVE: 5, SEBZE: 6, YAG: 7 },
  },
  {
    kcalLevel: 2800,
    targets: { EKMEK: 15, ET: 9, SUT: 4, MEYVE: 6, SEBZE: 6, YAG: 8 },
  },
]

function lerp(a: number, b: number, fraction: number): number {
  return a + (b - a) * fraction
}

// Hedef kaloriyi, en yakın iki kalori basamağı arasında DOĞRUSAL
// interpolasyonla grup başına değişim adedine çevirir. targetKcal tablonun
// uçlarının dışındaysa en yakın uca SIKIŞTIRILIR (extrapolasyon YAPILMAZ —
// 800 kcal veya 4000 kcal gibi uç değerler için tablo dışına çıkmak
// güvenilir olmaz, en yakın referans basamağı döndürülür).
export function deriveExchangeTargets(targetKcal: number): ExchangeTargetCounts {
  const table = EXCHANGE_DISTRIBUTION_TABLE
  const first = table[0]!
  const last = table[table.length - 1]!

  if (targetKcal <= first.kcalLevel) return { ...first.targets }
  if (targetKcal >= last.kcalLevel) return { ...last.targets }

  for (let i = 0; i < table.length - 1; i += 1) {
    const lower = table[i]!
    const upper = table[i + 1]!
    if (targetKcal >= lower.kcalLevel && targetKcal <= upper.kcalLevel) {
      const fraction = (targetKcal - lower.kcalLevel) / (upper.kcalLevel - lower.kcalLevel)
      const result = {} as ExchangeTargetCounts
      for (const code of EXCHANGE_GROUP_CODES) {
        result[code] = lerp(lower.targets[code], upper.targets[code], fraction)
      }
      return result
    }
  }
  // Buraya ULAŞILAMAZ (yukarıdaki erken dönüşler tüm aralığı kapsıyor) —
  // TypeScript'in kontrol akışı analizi bunu bilemediği için savunmacı bir
  // son çare.
  return { ...last.targets }
}

// Bir plandaki fiili değişim kullanımını (bkz. apps/web/src/lib/plan-
// exchanges.ts computeExchangeUsage — o fonksiyon gram->değişim dönüşümünü
// gerçek plan_items verisiyle yapar) hedeflerle karşılaştırır: target/used/
// remaining. remaining negatifse hedefin AŞILDIĞI anlamına gelir (panel
// bunu ayrıca renklendirir, bkz. exchange-panel.tsx).
export interface ExchangeGroupComparison {
  code: ExchangeGroupCode
  target: number
  used: number
  remaining: number
}

export function compareExchangeUsageToTargets(
  targets: ExchangeTargetCounts,
  used: Partial<Record<ExchangeGroupCode, number>>,
): ExchangeGroupComparison[] {
  return EXCHANGE_GROUP_CODES.map((code) => {
    const target = targets[code]
    const usedCount = used[code] ?? 0
    return { code, target, used: usedCount, remaining: target - usedCount }
  })
}
