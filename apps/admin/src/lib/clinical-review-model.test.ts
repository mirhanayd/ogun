import { describe, expect, it } from 'vitest'
import { clinicalTaskValidator } from './clinical-review-model'

const medicationTask = {
  id: 'task',
  status: 'pending',
  subjectType: 'medication' as const,
  targetType: 'food',
  action: 'caution',
  requiredCapability: 'medication_food',
}

describe('platform clinical assignment policy adapter', () => {
  it('uses the canonical role policy, not specialty text', () => {
    expect(
      clinicalTaskValidator('dietitian', ['medication_food'])(medicationTask, 'primary').eligible,
    ).toBe(false)
    expect(
      clinicalTaskValidator('pharmacist', ['medication_food'])(medicationTask, 'primary').eligible,
    ).toBe(true)
  })

  it('rejects terminal tasks before capability evaluation', () => {
    const validate = clinicalTaskValidator('clinical_admin', ['general_clinical'])
    expect(validate({ ...medicationTask, status: 'published' }, 'primary')).toMatchObject({
      eligible: false,
    })
    expect(validate({ ...medicationTask, status: 'rejected' }, 'primary')).toMatchObject({
      eligible: false,
    })
  })
})
