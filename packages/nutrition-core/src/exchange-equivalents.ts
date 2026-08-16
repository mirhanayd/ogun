// GitHub issue #28 / Prompt 5.6 — GÖREV 4: "Değişim formatında sonda grup
// eşdeğer tablosu bassın ('1 ekmek değişimi = 25 g ekmek = 2 yemek kaşığı
// pilav = ...')". Bu modül SADECE metni/veri şeklini üretir — gerçek PDF
// üretimi bu issue'nun kapsamı DIŞINDA (bkz. roadmap Prompt 6.1), çağıran
// katman (apps/web) bunu bir önizleme/demo bileşeninde gösterir.
//
// KURAL (bu paketin geneli): saf TypeScript, React/Next/DB/I-O yok — hangi
// besinlerin bir gruba ait olduğu (food_exchanges tablosu) burada BİLİNMİYOR,
// çağıran taraf bu bilgiyi (DB sorgusuyla) toplayıp girdi olarak veriyor.

export interface ExchangeEquivalentFoodInput {
  foodNameTr: string
  // İlgili besinin BU gruptaki 1 değişimine karşılık gelen gram miktarı
  // (bkz. packages/db/src/schema/exchanges.ts food_exchanges.gramsPerExchange).
  gramsPerExchange: number
  // Varsa besinin ev ölçüsü porsiyonu (ör. "yemek kaşığı") — food_portions'tan.
  portionLabel: string | null
  portionGrams: number | null
}

export interface ExchangeEquivalentEntry {
  foodNameTr: string
  // "25 g ekmek" gibi HER ZAMAN dolu olan gram gösterimi.
  gramText: string
  // Ev ölçüsü verisi varsa "2 yemek kaşığı pilav" gibi ek bir gösterim,
  // yoksa null (UI sadece gramText'i gösterir).
  portionText: string | null
}

export interface GroupEquivalentsRow {
  groupCode: string
  groupNameTr: string
  // "1 ekmek değişimi =" gibi satır başlığı.
  headerText: string
  equivalents: ExchangeEquivalentEntry[]
}

// Ondalığı gereksiz uzun göstermemek için: tam sayıysa nokta/virgülsüz,
// değilse tek ondalık basamak (ör. 2 yerine 2, 1.5 yerine 1,5 — TR yerel
// biçimi çağıran UI katmanının işi, burada nokta ile bırakılıyor, saf
// hesap katmanı).
function formatCount(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

// Bir değişim grubu için "1 X değişimi = ..." satırını, verilen aday
// besinlerden üretir. Sıralama/filtreleme (ör. alerjen elemesi, en fazla N
// besin) ÇAĞIRAN TARAFIN işi — bu fonksiyon SADECE biçimlendirir.
export function buildGroupEquivalentsRow(
  group: { code: string; nameTr: string },
  foods: readonly ExchangeEquivalentFoodInput[],
): GroupEquivalentsRow {
  const headerText = `1 ${group.nameTr.toLocaleLowerCase('tr-TR')} değişimi =`

  const equivalents: ExchangeEquivalentEntry[] = foods.map((food) => {
    const gramText = `${formatCount(food.gramsPerExchange)} g ${food.foodNameTr}`
    let portionText: string | null = null
    if (food.portionLabel && food.portionGrams !== null && food.portionGrams > 0) {
      const portionCount = food.gramsPerExchange / food.portionGrams
      portionText = `${formatCount(portionCount)} ${food.portionLabel} ${food.foodNameTr}`
    }
    return { foodNameTr: food.foodNameTr, gramText, portionText }
  })

  return { groupCode: group.code, groupNameTr: group.nameTr, headerText, equivalents }
}

// Bir planda GERÇEKTEN kullanılan gruplar için tüm eşdeğer satırlarını
// üretir — çıktı sırası, verilen groups dizisinin sırasını korur (çağıran
// taraf hangi sırayla göstereceğine kendi karar verir, ör. exchange-
// groups.ts seed sırası).
export function buildGroupEquivalentsTable(
  groups: readonly { code: string; nameTr: string }[],
  foodsByGroupCode: ReadonlyMap<string, ExchangeEquivalentFoodInput[]>,
): GroupEquivalentsRow[] {
  return groups.map((group) => buildGroupEquivalentsRow(group, foodsByGroupCode.get(group.code) ?? []))
}
