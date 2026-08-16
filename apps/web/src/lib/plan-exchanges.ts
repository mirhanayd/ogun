import { exchangesToGrams, gramsToExchanges, type ExchangeGroupCode } from '@ogun/nutrition-core'
import type { FoodIndexRow } from './food-index'

// GitHub issue #28 / Prompt 5.6 — GÖREV 1 + GÖREV 2: değişim modunun
// gram<->değişim dönüşümü ve panel kullanım toplamı. plan-nutrients.ts'teki
// AYNI KURAL: bu dosya nutrition-core'un gramsToExchanges/exchangesToGrams'ını
// ÇAĞIRIR, paralel bir hesap yolu YAZMAZ — tek iş, Dexie'deki besin öğesi
// indeksinin (bkz. lib/food-index.ts FoodIndexRow.exchange) taşıdığı
// grup/gramsPerExchange bilgisini nutrition-core'un ExchangeGroupDefinition
// şekline dönüştürmek.

export type FoodExchangeInfo = Pick<NonNullable<FoodIndexRow['exchange']>, 'groupCode' | 'groupNameTr' | 'gramsPerExchange'>

export interface ExchangeConvertibleItem {
  foodId: string | null
  amountGrams: number
}

// Bir plan kaleminin gram miktarını, besinin BİRİNCİL değişim grubuna göre
// değişim adedine çevirir. Besinin food_exchanges eşleşmesi yoksa (exchange
// === null) dönüşüm YAPILAMAZ — null döner, çağıran taraf (plan-item-row.tsx)
// bu durumda gram göstermeye devam eder.
export function convertItemToExchange(
  item: ExchangeConvertibleItem,
  foodLookup: ReadonlyMap<string, FoodExchangeInfo | null>,
): { groupCode: ExchangeGroupCode; groupNameTr: string; exchangeCount: number } | null {
  if (!item.foodId) return null
  const info = foodLookup.get(item.foodId)
  if (!info) return null
  return {
    groupCode: info.groupCode as ExchangeGroupCode,
    groupNameTr: info.groupNameTr,
    exchangeCount: gramsToExchanges(item.amountGrams, {
      code: info.groupCode,
      nameTr: info.groupNameTr,
      gramsPerExchange: info.gramsPerExchange,
      nutrientsPerExchange: {},
    }),
  }
}

// Tersi: kullanıcı değişim modunda bir kalemin miktarını değişim adedi
// olarak girdiğinde, DB'ye HER ZAMAN gram olarak yazılan plan_items.amount
// için grama çevirir (bkz. plan-editor-store.ts updateItemAmount — bu
// fonksiyonun kendisi DEĞİŞMEDİ, sadece çağrılmadan ÖNCE bu dönüşüm
// uygulanıyor, "aynı plan verisi farklı görünüm" kuralı).
export function convertExchangeCountToGrams(exchangeCount: number, info: FoodExchangeInfo): number {
  return exchangesToGrams(exchangeCount, {
    code: info.groupCode,
    nameTr: info.groupNameTr,
    gramsPerExchange: info.gramsPerExchange,
    nutrientsPerExchange: {},
  })
}

// GÖREV 2 — "Her grup için: hedef / kullanılan / kalan" panelinin
// "kullanılan" sütunu: bir planın (draft) TÜM kalemlerini gruplarına göre
// toplar. Serbest metin/tarif kalemleri (foodId === null) veya değişim
// eşleşmesi olmayan besinler SESSİZCE ATLANIR — bu, panelin "N kalem
// değişime dahil edilemedi" uyarısıyla ayrıca raporlanır (bkz.
// exchange-panel.tsx computeUnconvertedCount).
export function computeExchangeUsage(
  items: readonly ExchangeConvertibleItem[],
  foodLookup: ReadonlyMap<string, FoodExchangeInfo | null>,
): Partial<Record<ExchangeGroupCode, number>> {
  const totals: Partial<Record<ExchangeGroupCode, number>> = {}
  for (const item of items) {
    const converted = convertItemToExchange(item, foodLookup)
    if (!converted) continue
    totals[converted.groupCode] = (totals[converted.groupCode] ?? 0) + converted.exchangeCount
  }
  return totals
}

// Değişime dahil EDİLEMEYEN kalem sayısı (foodId yok ya da değişim
// eşleşmesi yok) — panelin uyarı satırı için.
export function computeUnconvertedItemCount(
  items: readonly ExchangeConvertibleItem[],
  foodLookup: ReadonlyMap<string, FoodExchangeInfo | null>,
): number {
  let count = 0
  for (const item of items) {
    if (!convertItemToExchange(item, foodLookup)) count += 1
  }
  return count
}
