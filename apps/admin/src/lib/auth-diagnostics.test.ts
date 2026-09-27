import { describe, expect, it } from 'vitest'
import { classifyAdminDatabaseTarget } from './auth-diagnostics'

describe('admin database-target diagnostics', () => {
  it('recognizes production direct and pooled Neon URLs', () => {
    expect(classifyAdminDatabaseTarget('postgresql://user:secret@ep-calm-heart-b1bm3vy6.c-5.eu-central-1.aws.neon.tech/neondb')).toBe('production')
    expect(classifyAdminDatabaseTarget('postgresql://user:secret@ep-calm-heart-b1bm3vy6-pooler.c-5.eu-central-1.aws.neon.tech/neondb')).toBe('production')
  })

  it('recognizes staging direct and pooled Neon URLs', () => {
    expect(classifyAdminDatabaseTarget('postgresql://user:secret@ep-snowy-field-b17y5klp.c-5.eu-central-1.aws.neon.tech/neondb')).toBe('staging')
    expect(classifyAdminDatabaseTarget('postgresql://user:secret@ep-snowy-field-b17y5klp-pooler.c-5.eu-central-1.aws.neon.tech/neondb')).toBe('staging')
  })

  it('does not expose an unknown URL or password', () => {
    expect(classifyAdminDatabaseTarget('postgresql://user:secret@unknown.example/neondb')).toBe('other')
    expect(classifyAdminDatabaseTarget('not-a-url')).toBe('other')
    expect(classifyAdminDatabaseTarget(undefined)).toBe('missing')
  })
})
