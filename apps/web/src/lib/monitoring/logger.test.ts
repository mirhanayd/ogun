import { describe, expect, it } from 'vitest'
import { scrubLogArgs } from './logger'

describe('scrubLogArgs', () => {
  it('redacts PII from Error messages, stacks and interpolation arguments', () => {
    const error = new Error('Patient ayse@example.com phone 05321234567')
    const result = scrubLogArgs([error, 'owner@example.com', { authorization: 'Bearer secret' }])
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain('ayse@example.com')
    expect(serialized).not.toContain('owner@example.com')
    expect(serialized).not.toContain('05321234567')
    expect(serialized).not.toContain('Bearer secret')
    expect(serialized).toContain('[REDACTED_EMAIL]')
  })
})
