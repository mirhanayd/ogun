import { describe, expect, it } from 'vitest'
import {
  canAccessAssignedClient,
  canAccessClientRecord,
  containsPlanVisibilityMutation,
  scopeClientListInput,
} from './client-access'

describe('danışan rol kapsamı', () => {
  it('owner için istenen filtreyi değiştirmez', () => {
    const input = { page: 2, assignedDietitianId: 'dietitian-b' }
    expect(scopeClientListInput(input, { role: 'owner', userId: 'owner-1' })).toBe(input)
  })

  it('dietitian için URL filtresini oturum kullanıcısıyla zorla değiştirir', () => {
    expect(
      scopeClientListInput(
        { search: 'ayşe', assignedDietitianId: 'baska-diyetisyen' },
        { role: 'dietitian', userId: 'dietitian-1' },
      ),
    ).toEqual({ search: 'ayşe', assignedDietitianId: 'dietitian-1' })
  })

  it('dietitian yalnızca kendisine atanmış danışana erişebilir', () => {
    const actor = { role: 'dietitian' as const, userId: 'dietitian-1' }
    expect(canAccessAssignedClient('dietitian-1', actor)).toBe(true)
    expect(canAccessAssignedClient('dietitian-2', actor)).toBe(false)
    expect(canAccessAssignedClient(null, actor)).toBe(false)
  })

  it('owner ve assistant için bile aktif klinikte bulunmayan danışanı reddeder', () => {
    expect(canAccessClientRecord(null, { role: 'owner', userId: 'owner-1' })).toBe(false)
    expect(canAccessClientRecord(null, { role: 'assistant', userId: 'assistant-1' })).toBe(false)
    expect(
      canAccessClientRecord(
        { assignedDietitianId: 'dietitian-1' },
        { role: 'owner', userId: 'owner-1' },
      ),
    ).toBe(true)
  })

  it('planın danışan/şablon görünürlüğünü değiştiren patchleri ayırt eder', () => {
    expect(containsPlanVisibilityMutation({})).toBe(false)
    expect(containsPlanVisibilityMutation({ clientId: null })).toBe(true)
    expect(containsPlanVisibilityMutation({ isTemplate: true })).toBe(true)
    expect(containsPlanVisibilityMutation({ templateCategory: null })).toBe(true)
  })
})
