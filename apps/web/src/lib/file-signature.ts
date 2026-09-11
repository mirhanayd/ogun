export type SupportedDocumentMime =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/heic'

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length))

export function matchesDocumentSignature(bytes: Uint8Array, mimeType: SupportedDocumentMime): boolean {
  if (mimeType === 'application/pdf') return ascii(bytes, 0, 5) === '%PDF-'
  if (mimeType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  }
  if (mimeType === 'image/webp') return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP'
  if (mimeType === 'image/heic') {
    if (ascii(bytes, 4, 4) !== 'ftyp') return false
    return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(ascii(bytes, 8, 4))
  }
  return false
}
