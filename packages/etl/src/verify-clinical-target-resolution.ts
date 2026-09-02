import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import {
  resolveClinicalInteractionTarget,
  summarizeTargetResolutions,
} from './clinical-interaction-targets'
import { OPENFDA_CANDIDATE_FILE } from './openfda-review-export'
import type { OpenFdaInteractionCandidate } from './openfda-types'

function loadCandidates(filePath: string) {
  return gunzipSync(readFileSync(filePath))
    .toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OpenFdaInteractionCandidate)
}

export function verifyClinicalTargetResolution(candidates: OpenFdaInteractionCandidate[]) {
  const summary = summarizeTargetResolutions(candidates)
  const invalidSafety = candidates
    .filter(
      (candidate) =>
        candidate.reviewRequired !== true ||
        candidate.notForProduction !== true ||
        candidate.clinicalRecommendation !== null,
    )
    .map((candidate) => candidate.id)
  const invalidResolutions = candidates
    .map((candidate) => ({
      candidateId: candidate.id,
      resolution: resolveClinicalInteractionTarget(candidate.targetType, candidate.target),
    }))
    .filter((item) => item.resolution.status !== 'resolved')
  return {
    status:
      invalidSafety.length === 0 && invalidResolutions.length === 0 ? ('PASS' as const) : ('FAIL' as const),
    ...summary,
    invalidSafety,
    invalidResolutions,
  }
}

async function main() {
  const argument = process.argv.slice(2).find((item) => item.startsWith('--dir='))
  const extractedDir = path.resolve(
    argument?.slice('--dir='.length) ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/clinical/openfda/extracted'),
  )
  const result = verifyClinicalTargetResolution(
    loadCandidates(path.join(extractedDir, OPENFDA_CANDIDATE_FILE)),
  )
  console.log(JSON.stringify(result, null, 2))
  if (result.status !== 'PASS') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
