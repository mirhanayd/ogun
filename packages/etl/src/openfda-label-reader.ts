import { createHash } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  openSync,
  readSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { PassThrough, type Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createInflateRaw } from 'node:zlib'
import type { OpenFdaLabelRecord } from './openfda-types'

const ZIP_EOCD_SIGNATURE = 0x06054b50
const ZIP_CENTRAL_SIGNATURE = 0x02014b50
const ZIP_LOCAL_SIGNATURE = 0x04034b50

export const OPENFDA_RELEVANT_SECTIONS = [
  { name: 'drug_interactions', priority: 1 },
  { name: 'dosage_and_administration', priority: 2 },
  { name: 'contraindications', priority: 3 },
  { name: 'warnings_and_cautions', priority: 4 },
  { name: 'patient_counseling_information', priority: 5 },
  { name: 'warnings', priority: 6 },
  { name: 'precautions', priority: 6 },
  { name: 'clinical_pharmacology', priority: 6 },
  { name: 'pharmacokinetics', priority: 6 },
  { name: 'information_for_patients', priority: 6 },
] as const

export type OpenFdaRelevantSection = {
  name: (typeof OPENFDA_RELEVANT_SECTIONS)[number]['name']
  priority: number
  text: string
}

function readExactly(fileDescriptor: number, position: number, length: number) {
  const buffer = Buffer.alloc(length)
  const bytes = readSync(fileDescriptor, buffer, 0, length, position)
  if (bytes !== length) throw new Error('openFDA ZIP beklenmedik biçimde sonlandı')
  return buffer
}

function findSignature(buffer: Buffer, signature: number) {
  for (let offset = buffer.length - 4; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) return offset
  }
  return -1
}

function openSingleJsonZip(zipPath: string): Readable {
  const fileDescriptor = openSync(zipPath, 'r')
  try {
    const size = statSync(zipPath).size
    const tailStart = Math.max(0, size - 65_557)
    const tail = readExactly(fileDescriptor, tailStart, size - tailStart)
    const eocdOffset = findSignature(tail, ZIP_EOCD_SIGNATURE)
    if (eocdOffset < 0) throw new Error('openFDA ZIP central directory bulunamadı')
    const entries = tail.readUInt16LE(eocdOffset + 10)
    const centralOffset = tail.readUInt32LE(eocdOffset + 16)
    if (entries !== 1) throw new Error(`openFDA partition ZIP tek JSON içermeli; entry=${entries}`)

    const central = readExactly(fileDescriptor, centralOffset, 46)
    if (central.readUInt32LE(0) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error('openFDA ZIP central header geçersiz')
    }
    const flags = central.readUInt16LE(8)
    const compression = central.readUInt16LE(10)
    const compressedSize = central.readUInt32LE(20)
    const uncompressedSize = central.readUInt32LE(24)
    const fileNameLength = central.readUInt16LE(28)
    const localOffset = central.readUInt32LE(42)
    const fileName = readExactly(fileDescriptor, centralOffset + 46, fileNameLength).toString('utf8')
    if (!fileName.endsWith('.json')) {
      throw new Error(`openFDA ZIP entry geçersiz: ${fileName}`)
    }
    if ((flags & 0x1) !== 0) throw new Error('Şifreli openFDA ZIP desteklenmiyor')
    if (![0, 8].includes(compression)) {
      throw new Error(`openFDA ZIP compression desteklenmiyor: ${compression}`)
    }

    const local = readExactly(fileDescriptor, localOffset, 30)
    if (local.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE) {
      throw new Error('openFDA ZIP local header geçersiz')
    }
    const localNameLength = local.readUInt16LE(26)
    const localExtraLength = local.readUInt16LE(28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = createReadStream(zipPath, {
      start: dataStart,
      end: dataStart + compressedSize - 1,
    })
    const output = compression === 8 ? compressed.pipe(createInflateRaw()) : compressed
    let outputBytes = 0
    const counted = new PassThrough()
    output.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length
    })
    output.on('end', () => {
      if (outputBytes !== uncompressedSize) {
        counted.destroy(
          new Error(`openFDA ZIP eksik açıldı: ${outputBytes}/${uncompressedSize} byte`),
        )
      }
    })
    return output.pipe(counted)
  } finally {
    closeSync(fileDescriptor)
  }
}

export function openOpenFdaPartition(filePath: string): Readable {
  if (filePath.endsWith('.json.zip')) return openSingleJsonZip(filePath)
  if (filePath.endsWith('.json')) return createReadStream(filePath)
  throw new Error(`Desteklenmeyen openFDA partition dosyası: ${path.basename(filePath)}`)
}

export async function* streamOpenFdaResults(input: Readable) {
  const decoder = new StringDecoder('utf8')
  let prefix = ''
  let resultsStarted = false
  let rawRecord = ''
  let depth = 0
  let inString = false
  let escaped = false
  let resultsEnded = false

  const consume = function* (text: string) {
    if (!resultsStarted) {
      prefix += text
      const match = /"results"\s*:\s*\[/.exec(prefix)
      if (!match) {
        if (prefix.length > 1_000_000) throw new Error('openFDA JSON results alanı bulunamadı')
        return
      }
      resultsStarted = true
      text = prefix.slice(match.index + match[0].length)
      prefix = ''
    }

    for (const char of text) {
      if (resultsEnded) continue
      if (depth === 0) {
        if (/\s|,/.test(char)) continue
        if (char === ']') {
          resultsEnded = true
          continue
        }
        if (char !== '{') throw new Error(`openFDA results içinde beklenmeyen token: ${char}`)
        rawRecord = '{'
        depth = 1
        inString = false
        escaped = false
        continue
      }

      rawRecord += char
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === '{' || char === '[') depth += 1
      else if (char === '}' || char === ']') depth -= 1

      if (depth === 0) {
        const record = JSON.parse(rawRecord) as OpenFdaLabelRecord
        const recordHash = createHash('sha256').update(rawRecord).digest('hex')
        yield { record, recordHash }
        rawRecord = ''
      }
    }
  }

  for await (const chunk of input) yield* consume(decoder.write(chunk as Buffer))
  yield* consume(decoder.end())
  if (!resultsStarted || !resultsEnded || depth !== 0) {
    throw new Error('openFDA JSON results dizisi eksik veya bozuk')
  }
}

export async function* streamOpenFdaPartition(filePath: string) {
  yield* streamOpenFdaResults(openOpenFdaPartition(filePath))
}

function sectionText(value: unknown) {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : []
  return values
    .filter((item): item is string => typeof item === 'string')
    .join('\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractRelevantOpenFdaSections(
  record: OpenFdaLabelRecord,
): OpenFdaRelevantSection[] {
  return OPENFDA_RELEVANT_SECTIONS.flatMap(({ name, priority }) => {
    const text = sectionText(record[name])
    return text ? [{ name, priority, text }] : []
  })
}
