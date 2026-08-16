import 'server-only'
import {
  buildGroupEquivalentsTable,
  calculateMacroDistribution,
  calculatePlan,
  classifyNutrientLevel,
  generateLiveNutrientWarnings,
  gramsToExchanges,
  selectAgeGroupReference,
  TUBER_2022_PLACEHOLDER,
  type DailyPlan,
  type ExchangeGroupDefinition,
  type Meal,
  type MealItem,
} from '@ogun/nutrition-core'
import {
  getClientById,
  getClientHealth,
  getClinicById,
  getFoodDetailsByIds,
  getNutrientDefinitions,
  getPlanTree,
  getRecipeNamesByIds,
  getUserNameById,
  listExchangeGroups,
  listFoodsForExchangeGroup,
  type FoodIndexEntry,
  type PlanTree,
} from '@ogun/db/queries'
import type { Database } from '@ogun/db'
import type { ClientAllergenEntry } from '@ogun/db/schema'
import { calculateAge } from '@/lib/client-age'
import { findAllergenConflicts } from '@/lib/allergen-conflict'
import type {
  PdfDay,
  PdfExchangeEquivalentsRow,
  PdfLayoutOptions,
  PdfMeal,
  PdfMealItem,
  PdfNutrientSummary,
  PdfPlanData,
} from '@ogun/pdf'

// GitHub issue #35 / Prompt 6.1 — GÖREV: PDF'in TEK girdi şeklini
// (@ogun/pdf'in PdfPlanData'sı) DB'den kurar. Bu, packages/pdf'in dosya
// başı notundaki ayrımın karşı tarafı: packages/pdf DB'ye bağımlı DEĞİL,
// bu dosya ise TAM TERSİ — sadece DB okur, hiç JSX/react-pdf İÇERMEZ. İKİ
// çağrı noktası bunu KULLANIR (bkz. pdf-actions.ts): (1) istemci tarafı
// canlı önizleme (PDFViewer'a JSON olarak gider), (2) sunucu tarafı
// Buffer üretimi (@ogun/pdf/server renderPlanPdfBuffer'a gider) — AYNI
// çözümleme, İKİ AYRI hesap yolu YAZILMADI.
//
// KAPSAM SINIRI (tarif/recipe kalemleri): plan editörünün canlı besin öğesi
// paneli (#26, bkz. apps/web/src/lib/plan-live-panel.ts toCalcMeals) tarif
// kalemlerinin (recipeId dolu) besin öğesi katkısını HESAPLAMIYOR — sadece
// adını gösteriyor. PDF de AYNI sınırı miras alıyor: tarif kalemleri
// listede adıyla görünür (kcal sütunu boş kalır, nutrient summary'ye
// KATILMAZ). Bu, bu issue'nun YARATTIĞI yeni bir eksiklik DEĞİL, #26'dan
// devralınan var olan bir boşluk — PR açıklamasında ayrıca not düşüldü.
export type PdfGenerationOptions = Pick<PdfLayoutOptions, 'density' | 'showCalories' | 'includeNutrientSummaryPage'>

function collectFoodAndRecipeIds(tree: PlanTree): { foodIds: string[]; recipeIds: string[] } {
  const foodIds = new Set<string>()
  const recipeIds = new Set<string>()
  for (const day of tree.days) {
    for (const meal of day.meals) {
      for (const { item, alternatives } of meal.items) {
        if (item.foodId) foodIds.add(item.foodId)
        if (item.recipeId) recipeIds.add(item.recipeId)
        for (const alt of alternatives) {
          if (alt.foodId) foodIds.add(alt.foodId)
          if (alt.recipeId) recipeIds.add(alt.recipeId)
        }
      }
    }
  }
  return { foodIds: [...foodIds], recipeIds: [...recipeIds] }
}

interface ResolvedItemSource {
  foodId: string | null
  recipeId: string | null
  freeText: string | null
  amount: string // numeric sütun -> string (bkz. schema/plans.ts notu)
}

function resolveItemDisplay(
  source: ResolvedItemSource,
  format: PdfLayoutOptions['format'],
  foodDetails: Map<string, FoodIndexEntry>,
  recipeNames: Map<string, string>,
): { name: string; amountText: string; kcal: number | null } {
  const amountGrams = Number(source.amount)

  if (source.foodId) {
    const food = foodDetails.get(source.foodId)
    const name = food?.nameTr ?? 'Bilinmeyen besin'
    const kcal = food?.kcalPer100g != null ? (food.kcalPer100g * amountGrams) / 100 : null

    if (format === 'değişim_listesi' && food?.exchange) {
      const groupDef: ExchangeGroupDefinition = {
        code: food.exchange.groupCode,
        nameTr: food.exchange.groupNameTr,
        gramsPerExchange: food.exchange.gramsPerExchange,
        nutrientsPerExchange: {},
      }
      const count = gramsToExchanges(amountGrams, groupDef)
      const rounded = Math.round(count * 10) / 10
      return {
        name,
        amountText: `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${food.exchange.groupNameTr.toLocaleLowerCase('tr-TR')} değişimi`,
        kcal,
      }
    }
    return { name, amountText: `${amountGrams} g`, kcal }
  }

  if (source.recipeId) {
    const name = recipeNames.get(source.recipeId) ?? 'Tarif'
    return { name, amountText: `${amountGrams} g`, kcal: null }
  }

  return { name: source.freeText ?? 'Bilinmeyen kalem', amountText: `${amountGrams} g`, kcal: null }
}

async function buildExchangeEquivalents(
  db: Database,
  allergies: ClientAllergenEntry[] | null,
  intolerances: ClientAllergenEntry[] | null,
): Promise<PdfExchangeEquivalentsRow[]> {
  const foodsPerGroup = 5
  const groups = await listExchangeGroups(db)
  const foodsByGroupCode = new Map<
    string,
    { foodNameTr: string; gramsPerExchange: number; portionLabel: string | null; portionGrams: number | null }[]
  >()

  for (const group of groups) {
    const rows = await listFoodsForExchangeGroup(db, group.code, foodsPerGroup * 3)
    const filtered = rows
      .filter((row) => findAllergenConflicts(row.nameTr, allergies, intolerances).length === 0)
      .slice(0, foodsPerGroup)
      .map((row) => ({
        foodNameTr: row.nameTr,
        gramsPerExchange: row.gramsPerExchange,
        portionLabel: row.portionLabel,
        portionGrams: row.portionGrams,
      }))
    foodsByGroupCode.set(group.code, filtered)
  }

  return buildGroupEquivalentsTable(
    groups.map((g) => ({ code: g.code, nameTr: g.nameTr })),
    foodsByGroupCode,
  )
}

export async function resolvePlanPdfData(
  db: Database,
  clinicId: string,
  planId: string,
  options: PdfGenerationOptions,
): Promise<PdfPlanData> {
  const tree = await getPlanTree(db, clinicId, planId)
  if (!tree) throw new Error('Plan bulunamadı.')
  if (!tree.plan.clientId) throw new Error('Şablon planlar için PDF üretilemez — önce bir danışana uygulayın.')

  const [client, clinic, dietitianName, clientHealth, nutrientDefs] = await Promise.all([
    getClientById(db, clinicId, tree.plan.clientId),
    getClinicById(db, clinicId),
    tree.plan.createdBy ? getUserNameById(db, tree.plan.createdBy) : Promise.resolve(null),
    getClientHealth(db, clinicId, tree.plan.clientId),
    getNutrientDefinitions(db),
  ])
  if (!client) throw new Error('Danışan bulunamadı.')
  if (!clinic) throw new Error('Klinik bulunamadı.')

  const { foodIds, recipeIds } = collectFoodAndRecipeIds(tree)
  const [foodDetails, recipeNames] = await Promise.all([
    getFoodDetailsByIds(db, foodIds),
    getRecipeNamesByIds(db, recipeIds),
  ])

  const format = tree.plan.outputFormat

  const days: PdfDay[] = tree.days.map(({ day, meals: dayMeals }) => {
    const meals: PdfMeal[] = dayMeals.map(({ meal, items: mealItems }) => {
      const items: PdfMealItem[] = mealItems.map(({ item, alternatives }) => {
        const resolved = resolveItemDisplay(item, format, foodDetails, recipeNames)
        return {
          id: item.id,
          name: resolved.name,
          amountText: resolved.amountText,
          kcal: resolved.kcal,
          isOptional: item.isOptional,
          note: item.note,
          alternatives: alternatives.map((alt) => {
            const altResolved = resolveItemDisplay(alt, format, foodDetails, recipeNames)
            return {
              id: alt.id,
              name: altResolved.name,
              amountText: altResolved.amountText,
              kcal: altResolved.kcal,
            }
          }),
        }
      })
      const totalKcal = items.reduce<number | null>((sum, item) => {
        if (item.kcal === null) return sum
        return (sum ?? 0) + item.kcal
      }, null)
      return {
        id: meal.id,
        name: meal.name,
        time: meal.time,
        items,
        totalKcal,
      }
    })
    return { id: day.id, label: day.dayLabel ?? `Gün ${day.dayNumber}`, meals }
  })

  const allergies = clientHealth?.allergies ?? null
  const intolerances = clientHealth?.intolerances ?? null

  const exchangeEquivalents =
    format === 'değişim_listesi' ? await buildExchangeEquivalents(db, allergies, intolerances) : null

  let nutrientSummary: PdfNutrientSummary | null = null
  if (options.includeNutrientSummaryPage) {
    const coreNutrientCodes = nutrientDefs.filter((d) => d.isCore).map((d) => d.code)
    const calcMeals: Meal[] = []
    for (const { meals: dayMeals } of tree.days) {
      for (const { meal, items: mealItems } of dayMeals) {
        const calcItems: MealItem[] = []
        for (const { item } of mealItems) {
          if (!item.foodId) continue
          const food = foodDetails.get(item.foodId)
          if (!food) continue
          calcItems.push({
            food: {
              id: food.id,
              nameTr: food.nameTr,
              nutrientsPer100g: food.nutrientsPer100g,
              hasImputedValues: food.hasImputedValues,
            },
            grams: Number(item.amount),
          })
        }
        calcMeals.push({ name: meal.name, items: calcItems })
      }
    }
    const dailyPlan: DailyPlan = { meals: calcMeals }
    const result = calculatePlan(dailyPlan)
    const macroDistribution = calculateMacroDistribution(result.totalNutrients)
    const age = calculateAge(client.birthDate)
    const reference =
      client.sex && age !== null ? selectAgeGroupReference(TUBER_2022_PLACEHOLDER, age, client.sex) : null
    const nutrientLevels = reference ? classifyNutrientLevel(result.totalNutrients, reference) : []
    const warnings = generateLiveNutrientWarnings(dailyPlan, result, {
      targetKcal: tree.plan.targetKcal,
      reference,
      coreNutrientCodes,
    })
    const nutrientDefByCode = new Map(nutrientDefs.map((d) => [d.code, d]))
    nutrientSummary = {
      totalKcal: result.totalNutrients.ENERC_KCAL ?? 0,
      targetKcal: tree.plan.targetKcal,
      macroDistribution,
      nutrients: nutrientLevels
        .filter((level) => nutrientDefByCode.get(level.nutrientCode)?.isCore)
        .map((level) => ({
          nameTr: nutrientDefByCode.get(level.nutrientCode)?.nameTr ?? level.nutrientCode,
          unit: nutrientDefByCode.get(level.nutrientCode)?.unit ?? '',
          actualValue: level.actualValue,
          percentOfReference: level.percentOfReference,
          band: level.band,
        })),
      warnings: warnings.map((w) => w.message),
    }
  }

  const waterIntakeReminder = clientHealth?.waterIntakeMl
    ? `Günlük hedef su tüketimi: ${(clientHealth.waterIntakeMl / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} litre.`
    : 'Günde en az 2-2,5 litre su içmeyi unutmayın.'

  return {
    clinic: {
      name: clinic.name,
      logoDataUri: clinic.logoUrl,
      primaryColor: clinic.primaryColor,
      phone: clinic.phone,
      address: clinic.address,
    },
    clientName: `${client.firstName} ${client.lastName}`,
    dietitianName,
    planName: tree.plan.name,
    generatedAt: new Date().toISOString(),
    startDate: tree.plan.startDate ? tree.plan.startDate.toISOString() : null,
    endDate: tree.plan.endDate ? tree.plan.endDate.toISOString() : null,
    days,
    generalInstructions: tree.plan.generalInstructions,
    waterIntakeReminder,
    // GÖREV: "bir sonraki randevu" — randevu modülü bu repoda henüz YOK
    // (bkz. paket types.ts nextAppointmentText notu) — sahte veri ÜRETİLMEZ.
    nextAppointmentText: null,
    exchangeEquivalents,
    nutrientSummary,
    layout: {
      density: options.density,
      showCalories: options.showCalories,
      format,
      includeNutrientSummaryPage: options.includeNutrientSummaryPage,
    },
  }
}
