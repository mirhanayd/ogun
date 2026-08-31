import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { DEFAULT_RXNORM_PACKAGE_DIR } from './rxnorm-mapping'

export const DEFAULT_VERIFIED_RXNORM_EXPORT_PATH = path.resolve(
  DEFAULT_RXNORM_PACKAGE_DIR,
  '..',
  'verified',
  'verified-rxnorm-substances.jsonl.gz',
)

export type VerifiedRxNormExportInput = {
  medicationSubstanceId: string
  canonicalName: string
  rxcui: string
  tty: string | null
  sourceVersion: string
  mappingStatus: string
}

export function serializeVerifiedRxNormSubstances(rows: VerifiedRxNormExportInput[]) {
  return rows
    .map((row) => {
      if (row.mappingStatus !== 'verified') {
        throw new Error(`Verified RxNorm export candidate sızıntısı: ${row.medicationSubstanceId}`)
      }
      if (!row.tty || !['IN', 'PIN', 'MIN'].includes(row.tty)) {
        throw new Error(`Verified RxNorm export geçersiz TTY: ${row.medicationSubstanceId}`)
      }
      return JSON.stringify({
        medication_substance_id: row.medicationSubstanceId,
        canonical_name: row.canonicalName,
        rxcui: row.rxcui,
        tty: row.tty,
        source_version: row.sourceVersion,
      })
    })
    .join('\n')
}

export function writeVerifiedRxNormExport(
  rows: VerifiedRxNormExportInput[],
  destination = DEFAULT_VERIFIED_RXNORM_EXPORT_PATH,
) {
  mkdirSync(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.tmp`
  const jsonl = serializeVerifiedRxNormSubstances(rows)
  writeFileSync(temporary, gzipSync(jsonl ? `${jsonl}\n` : '', { level: 9 }))
  renameSync(temporary, destination)
  return { destination, verifiedMappings: rows.length }
}
