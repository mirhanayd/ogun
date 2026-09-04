import { describe, expect, it } from 'vitest'
import { ANAMNESIS_FORM_DEFAULT_VALUES } from '@/lib/validation/anamnesis-schemas'
import { buildLocalAnamnesisEntity, localHealthRecord } from './local-clinical'

const condition = {
  conditionId: 'condition-diabetes',
  nameTr: 'Diyabet',
  nameEn: 'Diabetes',
  sourceCode: 'DOID:9351',
  isNeoplasm: false,
  needsReview: false,
}
const medication = {
  key: 'product:parol' as const,
  kind: 'product' as const,
  medicationProductId: 'parol',
  medicationSubstanceId: null,
  name: 'PAROL 500 MG',
  substanceNames: ['Parasetamol'],
  barcode: '8690000000000',
  needsReview: false as const,
}

describe('desktop canonical anamnesis projection', () => {
  it('keeps canonical selections out of legacy text and survives a local restart read', () => {
    const stored = buildLocalAnamnesisEntity('client-1', {
      ...ANAMNESIS_FORM_DEFAULT_VALUES,
      conditions: 'Eski tanı\nDiyabet',
      conditionSelections: [condition],
      medications: 'Özel karışım\nPAROL 500 MG',
      medicationSelections: [medication],
    }, '2026-09-04T10:00:00.000Z')

    const restarted = localHealthRecord(stored)
    expect(restarted.conditionSelections).toEqual([condition])
    expect(restarted.medicationSelections).toEqual([medication])
    expect(restarted.legacyConditions).toEqual(['Eski tanı'])
    expect(restarted.legacyMedications).toEqual(['Özel karışım'])
  })

  it('projects server workspace selections as canonical badges', () => {
    const projected = localHealthRecord({
      id: 'client-1',
      conditions: ['Diyabet'],
      medications: ['PAROL 500 MG'],
      legacyConditions: [],
      legacyMedications: [],
      conditionSelections: [condition],
      medicationSelections: [{ ...medication, productName: medication.name }],
    })
    expect(projected.conditionSelections).toHaveLength(1)
    expect(projected.medicationSelections).toHaveLength(1)
    expect(projected.legacyConditions).toEqual([])
    expect(projected.legacyMedications).toEqual([])
  })
})
