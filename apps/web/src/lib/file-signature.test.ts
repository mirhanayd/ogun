import { describe, expect, it } from 'vitest'
import { matchesDocumentSignature } from './file-signature'

const bytes = (prefix: number[], text = '') => new Uint8Array([...prefix, ...Buffer.from(text)])

describe('document magic-byte validation', () => {
  it.each([
    ['application/pdf', bytes([], '%PDF-1.7')],
    ['image/jpeg', bytes([0xff, 0xd8, 0xff, 0xe0])],
    ['image/png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/webp', bytes([], 'RIFFxxxxWEBP')],
    ['image/heic', bytes([0, 0, 0, 20], 'ftypheic')],
  ] as const)('accepts %s signatures', (mimeType, data) => {
    expect(matchesDocumentSignature(data, mimeType)).toBe(true)
  })

  it('rejects a renamed executable', () => {
    expect(matchesDocumentSignature(bytes([], 'MZ executable'), 'application/pdf')).toBe(false)
  })
})
