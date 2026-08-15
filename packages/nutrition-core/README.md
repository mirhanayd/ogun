# @ogun/nutrition-core

Beslenme hesaplama motoru: saf TypeScript, veritabanına (`@ogun/db`) bağımlı
değil. Girdi olarak sade tipler (`FoodReference`, `Meal`, `DailyPlan`) alır;
DB'den gelen veriyi bu tiplere dönüştürmek çağıran kodun sorumluluğundadır
(örnek: `packages/etl/src/e2e-plan-validation.ts`).

Bağımsız olmasının nedeni: test edilebilirlik (DB olmadan hızlı birim testleri)
ve gelecekte mobil/edge ortamda da kullanılabilmesi.

## Kurulum

Workspace içinde: `"@ogun/nutrition-core": "workspace:*"`

## Modüller

| Dosya | Ne işe yarar |
|---|---|
| `types.ts` | Ortak tipler: `NutrientValuesPer100g`, `Portion`, `FoodReference`, `Meal`, `DailyPlan`. `NUTRIENT` sabiti sık kullanılan besin öğesi kodlarını taşır (`ENERC_KCAL`, `PROCNT`, `FAT`, `CHOCDF`, `FIBTG`, `ALC`). |
| `portion.ts` | 100g ↔ porsiyon gram dönüşümleri (`scaleNutrientsToGrams`, `portionToGrams`, `gramsToPortionQuantity`). |
| `energy.ts` | Atwater enerji hesabı (4-4-9) ve beyan edilen enerjiyle karşılaştırma (`calculateAtwaterEnergyKcal`, `compareEnergyToAtwater`). ETL'nin BLS/USDA doğrulamasıyla aynı fonksiyon — `packages/etl` buradan import eder, kopyası yok. |
| `plan.ts` | Öğün ve günlük plan toplamları (`calculateMealNutrients`, `calculatePlan`). |
| `cooking.ts` | Çiğ↔pişmiş gram dönüşümü ve pişirme kaybı (`rawGramsToCookedGrams`, `convertRawToCookedPer100g`). Yoğunlaşma etkisini hesaba katar — bkz. aşağıda. |
| `distribution.ts` | Enerjinin makro besin öğelerine (`calculateMacroDistribution`) ve öğünlere (`calculateMealEnergyDistribution`) yüzdesel dağılımı. |
| `energy-requirement.ts` | Mifflin-St Jeor formülüyle BMR ve aktivite faktörlü günlük enerji ihtiyacı (`calculateBmr`, `calculateDailyEnergyRequirement`). |
| `exchange.ts` | Değişim listesi (exchange list) gram ↔ değişim adedi dönüşümü. Grup tanımları (kaç gram = 1 değişim) çağıran koddan verilir, burada sabit veri yok. |
| `reference-comparison.ts` | Hesaplanan değerleri bir referans aralığıyla (TÜBER gibi) karşılaştırma (`compareToReference`). |
| `data/tuber-2022.ts` | ⚠ **Yer tutucu veri.** Gerçek TÜBER 2022 değerleri değil — yapıyı test etmek için 3 örnek yaş grubuyla dolduruldu. Gerçek veri seti geldiğinde değiştirilecek. |
| `warnings.ts` | Güvenlik/veri kalitesi uyarı kanalı (`generatePlanWarnings`): minimum kalori sınırı, haftada 1 kg'dan hızlı kayıp, tahmini (`isImputed`) veri bilgilendirmesi. |

## Pişirme dönüşümünde yoğunlaşma etkisi

`convertRawToCookedPer100g`, sadece pişirme kaybını (retention factor) değil,
ağırlık kaybından kaynaklanan **yoğunlaşma etkisini** de hesaba katar:

```
pişmiş_100g_değeri = çiğ_100g_değeri × (retention_factor / yield_factor)
```

Örnek: tavuk göğsü pişince suyunun bir kısmını kaybeder (`yield: 0.75`),
protein neredeyse hiç kaybolmaz (`retention: 1`). Sonuç: pişmiş 100g'daki
protein çiğden **daha yüksek** çıkar (23g → ~30.7g) — gerçek USDA verisiyle
tutarlı bir davranış, sezgiye aykırı görünse de doğru.

## Kullanım örneği

```ts
import {
  calculatePlan,
  calculateMacroDistribution,
  generatePlanWarnings,
  NUTRIENT,
  type DailyPlan,
} from '@ogun/nutrition-core'

const plan: DailyPlan = {
  meals: [
    {
      name: 'Kahvaltı',
      items: [{ food: tavukGogsu, grams: 150 }],
    },
  ],
}

const result = calculatePlan(plan)
console.log(result.totalNutrients[NUTRIENT.ENERGY_KCAL])

const macros = calculateMacroDistribution(result.totalNutrients)
const warnings = generatePlanWarnings(plan, result, { sex: 'female' })
```

## Test, benchmark, uçtan uca doğrulama

```bash
pnpm test         # Vitest birim testleri (golden test'ler dahil)
pnpm benchmark    # Sentetik büyük planlarla performans ölçümü
pnpm typecheck
```

Gerçek DB verisiyle uçtan uca doğrulama bu paketin DIŞINDA,
`packages/etl/src/e2e-plan-validation.ts` içinde yaşar (nutrition-core DB'ye
bağımlı olmadığı için) — çalıştırmak için `packages/etl` içinde `pnpm etl:e2e`.
