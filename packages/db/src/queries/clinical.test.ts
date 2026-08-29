import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../client'
import { clientHealth, clients } from '../schema/clients'
import { clientConditions, clientMedications } from '../schema/clinical'
import { clinics } from '../schema/tenancy'
import {
  getClientClinicalSelections,
  mergeLegacyAndCatalogLabels,
  replaceClientConditions,
  replaceClientMedications,
  withoutCatalogLabels,
} from './client-clinical'
import {
  findConditionsByAlias,
  searchConditions,
  searchMedicationProducts,
  searchMedicationSubstances,
} from './clinical'

describe('clinical legacy label helpers', () => {
  it('canonical etiketleri legacy serbest metinden ayırır', () => {
    expect(
      withoutCatalogLabels(['Şeker', 'Tip 2 diabetes mellitus'], ['Tip 2 diabetes mellitus']),
    ).toEqual(['Şeker'])
  })

  it('legacy serbest metni canonical etiketlerle kayıpsız birleştirir', () => {
    expect(mergeLegacyAndCatalogLabels(['Şeker'], ['Tip 2 diabetes mellitus'])).toEqual([
      'Şeker',
      'Tip 2 diabetes mellitus',
    ])
  })

  it('Türkçe karakter ve büyük-küçük harf farkıyla oluşan tekrarları engeller', () => {
    expect(mergeLegacyAndCatalogLabels(['İLAÇ', 'ilaç'], ['İlaç'])).toEqual(['İLAÇ'])
  })
})

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip
// Katalog verisi mevcut geliştirme projesinin 512 MB kotasını doldurabiliyor.
// Mutasyon testleri bu nedenle yalnız yazılabilir bir integration DB açıkça
// verildiğinde çalışır; salt-okuma katalog doğrulamaları DATABASE_URL ile her
// zaman çalışmaya devam eder.
const describeWithWritableDb =
  process.env.DATABASE_URL && process.env.CLINICAL_WRITE_TESTS === '1' ? describe : describe.skip

describeWithDb.sequential('clinical catalog integration', () => {
  let db!: Database

  beforeAll(async () => {
    ;({ db } = await import('../client'))
  })

  it('"tip 2 diy" araması doğru condition ve Türkçe aliası getirir', async () => {
    const results = await searchConditions(db, 'tip 2 diy', { limit: 10 })
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceCode: 'DOID:9352',
          matchedAlias: 'Tip 2 diyabet',
        }),
      ]),
    )
  })

  it('Türkçe alias exact araması canonical condition kaydına ulaşır', async () => {
    const results = await findConditionsByAlias(db, 'Tip 2 diyabet')
    expect(results[0]).toMatchObject({ sourceCode: 'DOID:9352', matchedAliasLanguage: 'tr' })
  })

  it('"glif" araması GLİFOR ürününü ve metformin bağlantısını getirir', async () => {
    const results = await searchMedicationProducts(db, 'glif', { limit: 36 })
    const glifor = results.find((product) => product.name.startsWith('GLİFOR'))
    expect(glifor).toBeDefined()
    expect(glifor?.substances.some((substance) => /metformin/i.test(substance.nameTr))).toBe(true)
  })

  it('etkin madde araması canonical metformin kaydını getirir', async () => {
    const results = await searchMedicationSubstances(db, 'metformin', 20)
    expect(
      results.some((substance) => substance.nameTr.toLocaleLowerCase('tr-TR') === 'metformin'),
    ).toBe(true)
  })
})

describeWithWritableDb.sequential('client clinical persistence integration', () => {
  let db!: Database
  const clinicAId = createId()
  const clinicBId = createId()
  const clientAId = createId()
  const clientBId = createId()
  let conditionId = ''
  let medicationProductId = ''
  let medicationSubstanceId = ''

  beforeAll(async () => {
    ;({ db } = await import('../client'))
    const [condition] = await searchConditions(db, 'tip 2 diy', { limit: 10 })
    const products = await searchMedicationProducts(db, 'glifor', { limit: 20 })
    const product = products.find((item) => item.name.startsWith('GLİFOR'))
    if (!condition || !product || !product.substances[0]) {
      throw new Error('Clinical test fixtures katalogda bulunamadı.')
    }
    conditionId = condition.id
    medicationProductId = product.id
    medicationSubstanceId = product.substances[0].id

    await db.insert(clinics).values([
      { id: clinicAId, name: 'Clinical Test A', slug: `clinical-test-a-${clinicAId}` },
      { id: clinicBId, name: 'Clinical Test B', slug: `clinical-test-b-${clinicBId}` },
    ])
    await db.insert(clients).values([
      { id: clientAId, clinicId: clinicAId, firstName: 'Test', lastName: 'A' },
      { id: clientBId, clinicId: clinicBId, firstName: 'Test', lastName: 'B' },
    ])
    await db.insert(clientHealth).values({
      clientId: clientAId,
      conditions: ['Şeker'],
      medications: ['Eski ilaç'],
    })
  })

  afterAll(async () => {
    await db.delete(clientHealth).where(inArray(clientHealth.clientId, [clientAId, clientBId]))
    await db.delete(clients).where(inArray(clients.id, [clientAId, clientBId]))
    await db.delete(clinics).where(inArray(clinics.id, [clinicAId, clinicBId]))
  })

  it('cross-tenant client okumasını ve güncellemesini engeller', async () => {
    await expect(getClientClinicalSelections(db, clinicBId, clientAId)).rejects.toThrow(
      /bu kliniğe ait değil/i,
    )
    await expect(
      replaceClientConditions(db, clinicBId, clientAId, [{ conditionId }]),
    ).rejects.toThrow(/bu kliniğe ait değil/i)
  })

  it('client_conditions kaydını persist eder ve legacy condition metnini korur', async () => {
    await replaceClientConditions(db, clinicAId, clientAId, [{ conditionId }])
    const relations = await db
      .select()
      .from(clientConditions)
      .where(eq(clientConditions.clientId, clientAId))
    const [health] = await db
      .select({ conditions: clientHealth.conditions })
      .from(clientHealth)
      .where(eq(clientHealth.clientId, clientAId))

    expect(relations).toHaveLength(1)
    expect(relations[0]?.conditionId).toBe(conditionId)
    expect(health?.conditions).toContain('Şeker')
    expect(health?.conditions).toContain('Tip 2 diabetes mellitus')
  })

  it('duplicate condition ve medication seçimlerini reddeder', async () => {
    await expect(
      replaceClientConditions(db, clinicAId, clientAId, [{ conditionId }, { conditionId }]),
    ).rejects.toThrow(/birden fazla kez/i)
    await expect(
      replaceClientMedications(db, clinicAId, clientAId, [
        { medicationProductId },
        { medicationProductId },
      ]),
    ).rejects.toThrow(/birden fazla kez/i)
  })

  it('client_medications kaydını persist eder ve legacy medication metnini korur', async () => {
    await replaceClientMedications(db, clinicAId, clientAId, [
      { medicationProductId },
      { medicationSubstanceId },
    ])
    const relations = await db
      .select()
      .from(clientMedications)
      .where(eq(clientMedications.clientId, clientAId))
    const [health] = await db
      .select({ medications: clientHealth.medications })
      .from(clientHealth)
      .where(eq(clientHealth.clientId, clientAId))

    expect(relations).toHaveLength(2)
    expect(relations.some((row) => row.medicationProductId === medicationProductId)).toBe(true)
    expect(relations.some((row) => row.medicationSubstanceId === medicationSubstanceId)).toBe(true)
    expect(health?.medications).toContain('Eski ilaç')
  })

  it('canonical seçimler kaldırıldığında legacy serbest metni silmez', async () => {
    await replaceClientConditions(db, clinicAId, clientAId, [])
    await replaceClientMedications(db, clinicAId, clientAId, [])
    const [health] = await db
      .select({ conditions: clientHealth.conditions, medications: clientHealth.medications })
      .from(clientHealth)
      .where(eq(clientHealth.clientId, clientAId))

    expect(health?.conditions).toEqual(['Şeker'])
    expect(health?.medications).toEqual(['Eski ilaç'])
  })
})
