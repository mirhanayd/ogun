import { boolean, numeric, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'
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
export const foodExchanges = pgTable('food_exchanges', {
  id: id(),
  foodId: text('food_id')
    .notNull()
    .references(() => foods.id),
  groupId: text('group_id')
    .notNull()
    .references(() => exchangeGroups.id),
  gramsPerExchange: numeric('grams_per_exchange', { precision: 8, scale: 2 }).notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
})
