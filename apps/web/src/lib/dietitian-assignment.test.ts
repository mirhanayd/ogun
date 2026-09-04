import { describe, expect, it } from 'vitest'
import { assignedDietitianForNewClient, canManuallyAssignDietitian } from './dietitian-assignment'

describe('dietitian assignment rules across runtimes', () => {
  it('allows only owners to assign manually', () => {
    expect(canManuallyAssignDietitian('owner')).toBe(true)
    expect(canManuallyAssignDietitian('dietitian')).toBe(false)
    expect(canManuallyAssignDietitian('assistant')).toBe(false)
  })

  it('auto-assigns only dietitian-created clients', () => {
    expect(assignedDietitianForNewClient('dietitian', 'dietitian-1')).toBe('dietitian-1')
    expect(assignedDietitianForNewClient('owner', 'owner-1')).toBeNull()
    expect(assignedDietitianForNewClient('assistant', 'assistant-1')).toBeNull()
  })
})
