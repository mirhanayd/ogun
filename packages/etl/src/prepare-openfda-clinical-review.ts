import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { prepareClinicalReviewPack } from './clinical-review-pack'
import {
  OPENFDA_CANDIDATE_FILE,
  OPENFDA_EVIDENCE_FILE,
  OPENFDA_SUMMARY_FILE,
  type OpenFdaExtractionSummary,
} from './openfda-review-export'
import type {
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
} from './openfda-types'

function readJsonl<T>(filePath: string): T[] {
  return gunzipSync(readFileSync(filePath))
    .toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

export function prepareOpenFdaClinicalReview(baseDir: string) {
  const extractedDir = path.join(baseDir, 'extracted')
  return prepareClinicalReviewPack({
    candidates: readJsonl<OpenFdaInteractionCandidate>(
      path.join(extractedDir, OPENFDA_CANDIDATE_FILE),
    ),
    evidence: readJsonl<OpenFdaCandidateEvidence>(path.join(extractedDir, OPENFDA_EVIDENCE_FILE)),
    summary: JSON.parse(
      readFileSync(path.join(extractedDir, OPENFDA_SUMMARY_FILE), 'utf8'),
    ) as OpenFdaExtractionSummary,
    outputDir: path.join(baseDir, 'review', 'clinical'),
  })
}

async function main() {
  const argument = process.argv.slice(2).find((item) => item.startsWith('--dir='))
  const baseDir = path.resolve(
    argument?.slice('--dir='.length) ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/clinical/openfda'),
  )
  console.log(JSON.stringify(prepareOpenFdaClinicalReview(baseDir), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
