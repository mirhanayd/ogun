import { boolean, index, numeric, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
import { foods } from './foods'
import { id, timestamps } from './_helpers'

export const exchangeGroupCodeEnum = pgEnum('exchange_group_code', [
  'EKMEK',
  'ET',
  'SUT',
  'MEYVE',
  'SEBZE',
  'YAG',
])
export type ExchangeGroupCode = (typeof exchangeGroupCodeEnum.enumValues)[number]

// Türk diyetetiğinde bir "değişim"in standart makro içeriği — plan yazarken
// grama değil bu birime dayalı hesap yapmak isteyen diyetisyenler için referans.
export const exchangeGroups = pgTable('exchange_groups', {
  id: id(),
  code: exchangeGroupCodeEnum('code').notNull().unique(),
  nameTr: text('name_tr').notNull(),
  refKcal: numeric('ref_kcal', { precision: 8, scale: 2 }).notNull(),
  refProtein: numeric('ref_protein', { precision: 8, scale: 2 }).notNull(),
  refCarb: numeric('ref_carb', { precision: 8, scale: 2 }).notNull(),
  refFat: numeric('ref_fat', { precision: 8, scale: 2 }).notNull(),
  ...timestamps(),
})

// Bir besin birden fazla gruba ait olabilir (ör. kuru baklagil: ekmek + et değişimi).
// isPrimary, besinin varsayılan/önerilen grubunu işaretler.
export const foodExchanges = pgTable(
  'food_exchanges',
  {
    id: id(),
    foodId: text('food_id')
      .notNull()
      .references(() => foods.id),
    groupId: text('group_id')
      .notNull()
      .references(() => exchangeGroups.id),
    gramsPerExchange: numeric('grams_per_exchange', { precision: 8, scale: 2 }).notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
  },
  (table) => [
    // GitHub issue #28 / Prompt 5.6 — "değişim → besin önerisi" (GÖREV 3),
    // bir gruba ait besinleri listeleyen en sık sorgu deseni (bkz.
    // queries/exchanges.ts listFoodsForExchangeGroup).
    index('food_exchanges_group_id_idx').on(table.groupId),
    // Offline besin indeksinin (bkz. queries/food-search.ts
    // getAllFoodIndexEntries) bir besinin birincil grubunu (isPrimary=true)
    // LATERAL join ile bulması için.
    index('food_exchanges_food_id_is_primary_idx').on(table.foodId, table.isPrimary),
  ],
)
