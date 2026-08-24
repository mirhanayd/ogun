import 'fake-indexeddb/auto'
import { afterAll, expect, it, vi } from 'vitest'

const databaseName = 'ogun-food-index'

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}

afterAll(async () => {
  vi.restoreAllMocks()
  await deleteDatabase()
})

it('ağ kesildiğinde önceden indirilen tam besin kataloğuyla arama yapar', async () => {
  const entry = {
    id: 'ogun-test-food',
    nameTr: 'Toyga Çorba',
    searchText: 'toyga corba',
    groupNameTr: 'Çorbalar',
    kcalPer100g: 125.6,
    proteinPer100g: 5.4,
    carbPer100g: 14.45,
    fatPer100g: 5,
    defaultPortion: { label: '1 kase', grams: 200 },
    ingredientNames: ['Yoğurt', 'Buğday'],
    nutrientsPer100g: { ENERC_KCAL: 125.6, PROCNT: 5.4, FE: 1.2, VITC: 0.65 },
    hasImputedValues: true,
    exchange: null,
  }
  const nutrientDefs = [
    {
      code: 'ENERC_KCAL',
      nameTr: 'Enerji',
      unit: 'kcal',
      category: 'makro',
      isCore: true,
      displayOrder: 0,
    },
  ]

  const version = 'v2-15521-test-2'
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('/api/foods/index/version')) {
        return Promise.resolve(Response.json({ version }))
      }
      if (url.includes('/api/foods/nutrients')) {
        return Promise.resolve(
          Response.json({
            version,
            entries: [
              {
                id: entry.id,
                nutrientsPer100g: entry.nutrientsPer100g,
                hasImputedValues: entry.hasImputedValues,
              },
            ],
          }),
        )
      }
      return Promise.resolve(
        Response.json({
          version,
          entries: [
            {
              ...entry,
              nutrientsPer100g: undefined,
              hasImputedValues: undefined,
            },
          ],
          nutrientDefs,
        }),
      )
    }),
  )
  const onlineModule = await import('./food-index')
  await onlineModule.initFoodIndex()
  await onlineModule.whenFoodIndexReady()
  expect((await onlineModule.searchFoodsOffline('toyga')).hits[0]?.nameTr).toBe('Toyga Çorba')

  vi.resetModules()
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')))
  const offlineModule = await import('./food-index')
  await offlineModule.initFoodIndex()

  const result = await offlineModule.searchFoodsOffline('toyga')
  expect(result.hits).toHaveLength(1)
  expect(result.hits[0]).toMatchObject({
    nameTr: 'Toyga Çorba',
    kcalPer100g: 125.6,
    proteinPer100g: 5.4,
  })
  expect(await offlineModule.getFoodIndexEntriesByIds(['ogun-test-food'])).toEqual(
    new Map([
      ['ogun-test-food', expect.objectContaining({ nutrientsPer100g: entry.nutrientsPer100g })],
    ]),
  )
})
