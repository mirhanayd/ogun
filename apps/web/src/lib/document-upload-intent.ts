import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PresignUploadInput } from './validation/document-schemas'

function payload(clientId: string, storageKey: string, input: PresignUploadInput) {
  return [clientId, storageKey, input.fileName, input.mimeType, input.sizeBytes, input.category].join('\n')
}

function secret() {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value) throw new Error('Upload intent signing is not configured.')
  return value
}

export function createDocumentUploadIntent(clientId: string, storageKey: string, input: PresignUploadInput): string {
  return createHmac('sha256', secret()).update(payload(clientId, storageKey, input)).digest('base64url')
}

export function verifyDocumentUploadIntent(
  clientId: string,
  storageKey: string,
  input: PresignUploadInput,
  token: string,
): boolean {
  const expected = Buffer.from(createDocumentUploadIntent(clientId, storageKey, input))
  const actual = Buffer.from(token)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
