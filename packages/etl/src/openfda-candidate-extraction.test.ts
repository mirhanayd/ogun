import { gunzipSync } from 'node:zlib'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, test } from 'vitest'
import { extractOpenFdaCandidateTriggers } from './openfda-candidate-extractor'
import {
  OpenFdaCandidateAccumulator,
  scoreOpenFdaCandidateConfidence,
} from './openfda-candidate-dedupe'
import {
  extractRelevantOpenFdaSections,
  streamOpenFdaResults,
  type OpenFdaRelevantSection,
} from './openfda-label-reader'
import {
  OPENFDA_CANDIDATE_FILE,
  OPENFDA_EVIDENCE_FILE,
  OPENFDA_SUMMARY_FILE,
  writeOpenFdaReviewArtifacts,
  type OpenFdaExtractionSummary,
} from './openfda-review-export'
import type {
  OpenFdaCandidateTrigger,
  OpenFdaLabelRecord,
  OpenFdaSubstanceMatch,
  VerifiedRxNormSeed,
} from './openfda-types'
import {
  buildVerifiedRxNormIndex,
  loadVerifiedRxNormSeeds,
  matchOpenFdaLabel,
  parseVerifiedRxNormSeeds,
} from './openfda-verified-filter'
import { DATABASE_HARD_LIMIT_BYTES, evaluateClinicalDatabaseFootprint } from './verify-rxnorm-size'

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const seed: VerifiedRxNormSeed = {
  medicationSubstanceId: 'meds-warfarin',
  canonicalName: 'warfarin',
  rxcui: '11289',
  tty: 'IN',
  sourceVersion: '2026-08-03',
}

function label(openfda: OpenFdaLabelRecord['openfda'] = {}): OpenFdaLabelRecord {
  return {
    id: 'spl-id',
    set_id: 'spl-set-id',
    effective_time: '20260831',
    openfda,
  }
}

function section(text: string, name: OpenFdaRelevantSection['name'] = 'drug_interactions') {
  return {
    name,
    priority: name === 'drug_interactions' ? 1 : 2,
    text,
  } satisfies OpenFdaRelevantSection
}

function trigger(text = 'Avoid grapefruit juice.') {
  return extractOpenFdaCandidateTriggers(section(text))[0]!
}

function match(overrides: Partial<OpenFdaSubstanceMatch> = {}): OpenFdaSubstanceMatch {
  return {
    seed,
    tier: 'exact_rxcui_match',
    matchedField: 'openfda.rxcui',
    matchedValue: seed.rxcui,
    ambiguous: false,
    ...overrides,
  }
}

function addEvidence(
  accumulator: OpenFdaCandidateAccumulator,
  overrides: {
    record?: OpenFdaLabelRecord
    recordHash?: string
    partitionFile?: string
    trigger?: OpenFdaCandidateTrigger
    match?: OpenFdaSubstanceMatch
  } = {},
) {
  accumulator.add({
    record: overrides.record ?? label({ rxcui: [seed.rxcui] }),
    recordHash: overrides.recordHash ?? 'record-hash-1',
    partitionFile: overrides.partitionFile ?? 'drug-label-0001-of-0014.json.zip',
    retrievedAt: '2026-08-31T00:00:00.000Z',
    match: overrides.match ?? match(),
    section: section(overrides.trigger?.evidenceSnippet ?? 'Avoid grapefruit juice.'),
    trigger: overrides.trigger ?? trigger(),
  })
}

describe('verified RxNorm seed and openFDA label linkage', () => {
  test('generated verified RxNorm export is the extraction seed', () => {
    const seeds = loadVerifiedRxNormSeeds()
    expect(seeds).toHaveLength(279)
    expect(seeds.every((item) => ['IN', 'PIN', 'MIN'].includes(item.tty))).toBe(true)
  })

  test('unverified/candidate metadata cannot enter the strict seed format', () => {
    expect(() =>
      parseVerifiedRxNormSeeds(
        `${JSON.stringify({ medication_substance_id: 'x', canonical_name: 'x', rxcui: '1', tty: 'IN', source_version: 'v', mapping_status: 'candidate' })}\n`,
      ),
    ).toThrow(/beklenmeyen alan/i)
  })

  test('label links by exact RxCUI', () => {
    expect(
      matchOpenFdaLabel(label({ rxcui: ['11289'] }), buildVerifiedRxNormIndex([seed]))[0],
    ).toMatchObject({
      tier: 'exact_rxcui_match',
      seed: { medicationSubstanceId: 'meds-warfarin' },
    })
  })

  test('label links by exact substance name', () => {
    expect(
      matchOpenFdaLabel(
        label({ substance_name: ['WARFARIN'] }),
        buildVerifiedRxNormIndex([seed]),
      )[0],
    ).toMatchObject({ tier: 'exact_substance_name_match' })
  })

  test('punctuation-only name variation has a separate normalized tier', () => {
    const combination = { ...seed, canonicalName: 'ledipasvir/sofosbuvir' }
    expect(
      matchOpenFdaLabel(
        label({ substance_name: ['ledipasvir / sofosbuvir'] }),
        buildVerifiedRxNormIndex([combination]),
      )[0],
    ).toMatchObject({ tier: 'normalized_substance_name_match' })
  })

  test('generic-name fallback is explicitly secondary', () => {
    expect(
      matchOpenFdaLabel(label({ generic_name: ['warfarin'] }), buildVerifiedRxNormIndex([seed]))[0],
    ).toMatchObject({ tier: 'secondary_generic_match' })
  })

  test('irrelevant label is filtered before section extraction', () => {
    expect(
      matchOpenFdaLabel(label({ substance_name: ['unrelated'] }), buildVerifiedRxNormIndex([seed])),
    ).toEqual([])
  })
})

describe('openFDA streaming label and section parser', () => {
  test('chunked results JSON emits complete records and stable hashes', async () => {
    const json = JSON.stringify({ meta: {}, results: [label(), { ...label(), id: 'second' }] })
    const input = Readable.from([json.slice(0, 17), json.slice(17, 53), json.slice(53)])
    const rows = []
    for await (const row of streamOpenFdaResults(input)) rows.push(row)
    expect(rows).toHaveLength(2)
    expect(rows[0]?.recordHash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('relevant section parser prioritizes drug interactions and ignores how supplied', () => {
    const sections = extractRelevantOpenFdaSections({
      drug_interactions: ['Vitamin K intake should remain consistent.'],
      dosage_and_administration: 'Take with food.',
      how_supplied: 'Store at room temperature.',
    })
    expect(sections.map((item) => [item.name, item.priority])).toEqual([
      ['drug_interactions', 1],
      ['dosage_and_administration', 2],
    ])
  })
})

describe('controlled deterministic interaction extraction', () => {
  test('drug_interactions section extracts vitamin K consistency', () => {
    expect(
      extractOpenFdaCandidateTriggers(section('Maintain a consistent intake of vitamin K.')),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'vitamin_k', action: 'consistency' }),
      ]),
    )
  })

  test('dosage section extracts take with food', () => {
    expect(
      extractOpenFdaCandidateTriggers(
        section('Patients should take each dose with food.', 'dosage_and_administration'),
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'take_with_food' })]))
  })

  test('dosage section extracts take without food', () => {
    expect(
      extractOpenFdaCandidateTriggers(
        section('Take the tablet on an empty stomach.', 'dosage_and_administration'),
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'take_without_food' })]))
  })

  test('alcohol avoidance uses controlled avoid_alcohol action', () => {
    expect(extractOpenFdaCandidateTriggers(section('Patients should avoid alcohol.'))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'alcohol', action: 'avoid_alcohol' }),
      ]),
    )
  })

  test('grapefruit juice avoidance is normalized', () => {
    expect(
      extractOpenFdaCandidateTriggers(section('Avoid grapefruit juice during treatment.')),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: 'grapefruit_juice', action: 'avoid' }),
      ]),
    )
  })

  test.each(['calcium', 'iron', 'magnesium'])(
    '%s timing is extracted with numeric offset',
    (mineral) => {
      const result = extractOpenFdaCandidateTriggers(
        section(`Do not administer within 2 hours of ${mineral}-containing products.`),
      )
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            target: mineral,
            action: 'separate_timing',
            beforeMinutes: 120,
            afterMinutes: 120,
          }),
        ]),
      )
    },
  )

  test('tyramine and caffeine remain controlled food components', () => {
    expect(extractOpenFdaCandidateTriggers(section('Avoid tyramine-rich foods.'))[0]).toMatchObject(
      {
        target: 'tyramine',
        targetType: 'food_component',
      },
    )
    expect(
      extractOpenFdaCandidateTriggers(section('Limit caffeine consumption.'))[0],
    ).toMatchObject({
      target: 'caffeine',
      action: 'limit',
    })
  })

  test('with-or-without-food boilerplate does not create a candidate', () => {
    expect(extractOpenFdaCandidateTriggers(section('May be taken with or without food.'))).toEqual(
      [],
    )
  })

  test('explicit no-food-effect text does not create a candidate', () => {
    expect(extractOpenFdaCandidateTriggers(section('Food has no effect on exposure.'))).toEqual([])
  })

  test.each([
    ['calcium channel blocker', 'Monitor patients receiving calcium channel blockers.'],
    ['calcium lab value', 'Monitor serum calcium concentrations regularly.'],
    ['calcium solution', 'Premature neonates require calcium and phosphate solution.'],
    [
      'iron accidental ingestion poisoning',
      'Risk of overdosage in children due to accidental ingestion of iron-containing products, a leading cause of fatal poisoning.',
    ],
    ['sodium drug salt', 'Meaningful elevation occurred with diclofenac sodium tablets.'],
    [
      'sodium injection',
      'Do not dilute with Sodium Chloride Injection because it may precipitate.',
    ],
    ['potassium lab value', 'Some patients developed increases in potassium during treatment.'],
    ['benzyl alcohol', 'This product does not contain benzyl alcohol.'],
    [
      'alcohol-containing topical product',
      'Avoid alcohol-, iodine-, or thyme-containing products.',
    ],
    ['breast milk', 'The drug was detected in human breast milk during lactation.'],
    ['nursing mother milk', 'In nursing mothers the medicine may decrease the quality of milk.'],
    [
      'negative caffeine study',
      'No clinically significant changes in exposure of caffeine were observed.',
    ],
    ['negative grapefruit study', 'Grapefruit juice has no impact on exposure.'],
    ['not significantly influenced', 'Absorption is not significantly influenced by food.'],
    ['alcohol-free mouthwash', 'Advise patients to use alcohol-free mouthwashes.'],
    ['flammable alcohol product', 'Alcohol-based products are flammable; avoid fire.'],
    ['alcohol swab', 'Clean the intended injection site with an alcohol swab before injection.'],
    [
      'alcohol used for skin cleansing',
      'If dermal exposure occurs, the hair and skin should be washed with alcohol immediately.',
    ],
    [
      'ethanol excipient',
      'The oral solution contains the excipients ethanol and propylene glycol, which may cause toxicity.',
    ],
    [
      'ethanol preceding excipient marker',
      `Total amounts of ethanol and propylene glycol from all medicines should be taken into account in order to avoid toxicity from ${'long formulation context '.repeat(5)}these excipients.`,
    ],
    [
      'not expected to affect',
      'Vitamin K is not expected to affect the anticoagulant activity of this medicine.',
    ],
    [
      'acute alcohol intoxication contraindication',
      'Do not administer the injection in acute alcohol intoxication with depression of vital signs.',
    ],
    [
      'negative alcohol dissolution study',
      'The addition of alcohol does not increase the dissolution rate of the oral suspension.',
    ],
    [
      'non-dietary ethanol scavenger',
      'Compounds that scavenge radicals, such as ethanol and formate, may decrease activity.',
    ],
    [
      'dosage maximum near diet wording',
      'Do not take more than 3 capsules daily; use with a reduced-calorie, low-fat diet.',
    ],
    ['food used for preparation', 'Do not use hot food when preparing the suspension.'],
    [
      'tube feeding as neonatal support',
      'Neonatal complications may require hospitalization, respiratory support, and tube feeding.',
    ],
    [
      'other combination agent food instruction',
      'Administer this medicine in combination with cabozantinib 40 mg orally once daily without food.',
    ],
    [
      'renal table contraindication near meal',
      'Dose once daily with evening meal. The medicine should not be administered to patients receiving hemodialysis.',
    ],
    [
      'avoid driving until meal',
      'Advise patients to avoid driving or operating machinery until ingesting a meal.',
    ],
    [
      'general dietary adherence',
      'Inform patients about the importance of adherence to dietary instructions and periodic blood glucose monitoring.',
    ],
    [
      'pregnancy alcohol exposure from formulation',
      'Do not take the oral solution during pregnancy because there is no known safe level of alcohol exposure during pregnancy.',
    ],
  ])('%s context does not create a food interaction candidate', (_name, text) => {
    expect(extractOpenFdaCandidateTriggers(section(text))).toEqual([])
  })

  test('generic within-hours pharmacology text does not create timing', () => {
    expect(
      extractOpenFdaCandidateTriggers(
        section('The onset of activity of liothyronine sodium occurs within a few hours.'),
      ),
    ).toEqual([])
  })

  test('after-meal administration is normalized to take_with_food', () => {
    expect(
      extractOpenFdaCandidateTriggers(
        section('Advise patients to take each dose after meals.', 'dosage_and_administration'),
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'take_with_food' })]))
  })

  test('separate study occasions do not become a timing instruction', () => {
    const result = extractOpenFdaCandidateTriggers(
      section(
        'In a food-effect study, subjects received a dose on three separate occasions: fasting and with a high-fat meal.',
        'pharmacokinetics',
      ),
    )
    expect(result).toEqual([])
    expect(result).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'separate_timing' })]),
    )
  })

  test('sodium restriction and potassium supplement contexts remain eligible', () => {
    expect(extractOpenFdaCandidateTriggers(section('Avoid sodium restriction.'))).toEqual(
      expect.arrayContaining([expect.objectContaining({ target: 'sodium', action: 'avoid' })]),
    )
    expect(
      extractOpenFdaCandidateTriggers(
        section('Potassium supplements may increase the risk of hyperkalemia.'),
      ),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ target: 'potassium' })]))
  })

  test('PK study administration does not become a meal directive', () => {
    expect(
      extractOpenFdaCandidateTriggers(
        section(
          'Multiple-dose PK parameters following oral administration with food were measured.',
          'pharmacokinetics',
        ),
      ),
    ).toEqual([])
    expect(
      extractOpenFdaCandidateTriggers(
        section('A single dose was administered under fasting conditions.', 'pharmacokinetics'),
      ),
    ).toEqual([])
    expect(
      extractOpenFdaCandidateTriggers(
        section('Exposure was comparable to that observed under fasting conditions.'),
      ),
    ).toEqual([])
  })

  test('an antacid effect is not mislabeled as take_with_food', () => {
    expect(
      extractOpenFdaCandidateTriggers(
        section('The dose was taken with food and total availability was reduced by an antacid.'),
      ),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ target: 'antacids', action: 'caution' })]),
    )
  })
})

describe('logical candidate dedupe and evidence binding', () => {
  test('duplicate observation produces one logical candidate', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator)
    addEvidence(accumulator)
    expect(accumulator.result()).toMatchObject({
      candidates: [{ evidenceCount: 1 }],
      evidence: [{ candidateId: expect.any(String) }],
    })
  })

  test('same logical candidate binds evidence from multiple labels', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator)
    addEvidence(accumulator, {
      record: { ...label({ rxcui: ['11289'] }), set_id: 'second-set' },
      recordHash: 'record-hash-2',
    })
    const result = accumulator.result()
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.evidenceCount).toBe(2)
    expect(result.evidence).toHaveLength(2)
  })

  test('same logical candidate in two partitions has one candidate and two evidence records', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator, { partitionFile: 'drug-label-0001-of-0014.json.zip' })
    addEvidence(accumulator, { partitionFile: 'drug-label-0002-of-0014.json.zip' })
    expect(accumulator.result()).toMatchObject({
      candidates: [{ evidenceCount: 2, sourcePartitionCount: 2 }],
      evidence: [{ candidateId: expect.any(String) }, { candidateId: expect.any(String) }],
    })
  })

  test('SPL versions retain latest and historical evidence provenance', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator, {
      record: { ...label({ rxcui: [seed.rxcui] }), effective_time: '20250101', version: '1' },
      recordHash: 'old-record',
    })
    addEvidence(accumulator, {
      record: { ...label({ rxcui: [seed.rxcui] }), effective_time: '20260101', version: '2' },
      recordHash: 'new-record',
    })
    const result = accumulator.result()
    expect(result.candidates[0]).toMatchObject({
      latestEvidenceCount: 1,
      historicalEvidenceCount: 1,
    })
    expect(result.evidence.map((item) => item.evidenceVersionStatus).sort()).toEqual([
      'historical',
      'latest',
    ])
  })

  test('ambiguous linkage is always low confidence', () => {
    expect(
      scoreOpenFdaCandidateConfidence(
        match({ ambiguous: true }),
        section('Avoid grapefruit.'),
        trigger('Avoid grapefruit.'),
      ),
    ).toBe('low')
  })

  test('single verified active ingredient is directly attributed', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator, {
      record: label({ rxcui: [seed.rxcui], substance_name: ['WARFARIN'] }),
    })
    expect(accumulator.result()).toMatchObject({
      candidates: [{ ingredientAttribution: 'direct_single_ingredient' }],
      evidence: [{ ingredientAttribution: 'direct_single_ingredient', activeIngredientCount: 1 }],
    })
  })

  test('multi-ingredient evidence without explicit component is unattributed and low confidence', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator, {
      record: label({ rxcui: [seed.rxcui], substance_name: ['WARFARIN', 'BIOTIN'] }),
      trigger: trigger('Avoid grapefruit juice.'),
    })
    expect(accumulator.result()).toMatchObject({
      candidates: [
        { ingredientAttribution: 'multi_ingredient_unattributed', candidateConfidence: 'low' },
      ],
    })
  })

  test('multi-ingredient evidence explicitly naming the component is attributable', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator, {
      record: label({ rxcui: [seed.rxcui], substance_name: ['WARFARIN', 'BIOTIN'] }),
      trigger: trigger('Warfarin patients should avoid grapefruit juice.'),
    })
    expect(accumulator.result().candidates[0]?.ingredientAttribution).toBe(
      'multi_ingredient_attributable',
    )
  })

  test('secondary generic linkage remains attribution-uncertain', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator, { match: match({ tier: 'secondary_generic_match' }) })
    expect(accumulator.result().candidates[0]).toMatchObject({
      ingredientAttribution: 'secondary_match_uncertain',
      candidateConfidence: 'low',
    })
  })

  test('candidate output has no recommendation and is not for production', () => {
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator)
    expect(accumulator.result().candidates[0]).toMatchObject({
      status: 'candidate',
      reviewRequired: true,
      notForProduction: true,
      clinicalRecommendation: null,
    })
  })

  test('long raw label text is never copied into candidate or evidence', () => {
    const marker = 'RAW_LABEL_MARKER_'.repeat(2_000)
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator, { record: { ...label(), warnings: marker } })
    const serialized = JSON.stringify(accumulator.result())
    expect(serialized).not.toContain(marker)
    expect(accumulator.result().evidence[0]?.evidenceSnippet.length).toBeLessThanOrEqual(480)
  })

  test('candidate IDs and counts are stable across identical runs', () => {
    const run = () => {
      const accumulator = new OpenFdaCandidateAccumulator()
      addEvidence(accumulator)
      addEvidence(accumulator)
      return accumulator.result()
    }
    expect(run()).toEqual(run())
  })
})

describe('filesystem review artifacts and safety guards', () => {
  test('gzip JSONL, summary and review CSV artifacts are created', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'ogun-openfda-review-'))
    temporaryDirectories.push(directory)
    const accumulator = new OpenFdaCandidateAccumulator()
    addEvidence(accumulator)
    const result = accumulator.result()
    const summary: OpenFdaExtractionSummary = {
      extractionVersion: 'openfda-food-candidate-v1',
      sourceLastUpdated: '2026-08-31',
      labelExportDate: '2026-08-31',
      retrievedAt: '2026-08-31T00:00:00Z',
      manifestPartitions: 14,
      availablePartitions: 1,
      missingPartitions: ['missing.zip'],
      partialCoverage: true,
      verifiedRxNormSeeds: 279,
      processedLabelRecords: 1,
      matchedLabels: 1,
      matchedSubstances: 1,
      relevantSections: 1,
      candidateObservations: 1,
      logicalCandidates: 1,
      evidenceRecords: 1,
      targetTypeCounts: {
        nutrient: 0,
        food_component: 0,
        food: 1,
        food_group: 0,
        supplement: 0,
        alcohol: 0,
        meal_timing: 0,
      },
      actionCounts: {
        avoid: 1,
        limit: 0,
        caution: 0,
        monitor: 0,
        consistency: 0,
        separate_timing: 0,
        take_with_food: 0,
        take_without_food: 0,
        avoid_alcohol: 0,
        individualize: 0,
      },
      confidenceCounts: { high: 1, medium: 0, low: 0 },
      attributionCounts: {
        direct_single_ingredient: 0,
        direct_substance_section: 0,
        multi_ingredient_attributable: 0,
        multi_ingredient_unattributed: 0,
        secondary_match_uncertain: 1,
      },
      globalDuplicatesCollapsed: 0,
      latestEvidenceRecords: 1,
      historicalEvidenceRecords: 0,
      verifiedSeedCoverage: { exactRxCui: 1, exactSubstanceName: 0, secondary: 0, noMatch: 278 },
      openfda: {
        manifestUrl: 'https://api.fda.gov/download.json',
        manifestLastUpdated: '2026-08-31',
        drugLabelExportDate: '2026-08-31',
        partitionCount: 14,
        expectedTotalRecords: 1,
        parsedTotalRecords: 1,
        manifestSha256: 'manifest-hash',
        partitionSha256: { 'drug-label-0001-of-0014.json.zip': 'partition-hash' },
      },
      rxnorm: {
        verifiedSeedCount: 279,
        verifiedSeedSha256: 'seed-hash',
        rxnormVersion: '2026-08-03',
      },
      extraction: { extractorVersion: 'openfda-food-candidate-v1', semanticHash: '' },
    }
    const artifacts = writeOpenFdaReviewArtifacts(
      result.candidates,
      result.evidence,
      summary,
      path.join(directory, 'extracted'),
      path.join(directory, 'review'),
    )
    expect(existsSync(path.join(directory, 'extracted', OPENFDA_CANDIDATE_FILE))).toBe(true)
    expect(existsSync(path.join(directory, 'extracted', OPENFDA_EVIDENCE_FILE))).toBe(true)
    expect(existsSync(path.join(directory, 'extracted', OPENFDA_SUMMARY_FILE))).toBe(true)
    expect(gunzipSync(readFileSync(artifacts.candidatePath)).toString()).toContain(
      'notForProduction',
    )
    expect(Object.values(artifacts.reviewPaths).every(existsSync)).toBe(true)
    expect(artifacts.reviewPaths).toMatchObject({
      multiIngredient: expect.stringContaining('openfda_multi_ingredient_review.csv'),
      attributionUncertain: expect.stringContaining('openfda_attribution_uncertain_review.csv'),
      lowConfidence: expect.stringContaining('openfda_low_confidence_review.csv'),
    })
    expect(summary.extraction.semanticHash).toBe(artifacts.outputHash)

    const secondDirectory = mkdtempSync(path.join(tmpdir(), 'ogun-openfda-review-second-'))
    temporaryDirectories.push(secondDirectory)
    const secondSummary = structuredClone(summary)
    const secondArtifacts = writeOpenFdaReviewArtifacts(
      result.candidates,
      result.evidence,
      secondSummary,
      path.join(secondDirectory, 'extracted'),
      path.join(secondDirectory, 'review'),
    )
    expect(secondArtifacts.outputHash).toBe(artifacts.outputHash)
    expect(readFileSync(secondArtifacts.candidatePath)).toEqual(
      readFileSync(artifacts.candidatePath),
    )
    expect(readFileSync(secondArtifacts.evidencePath)).toEqual(readFileSync(artifacts.evidencePath))
    expect(secondSummary.openfda).toMatchObject({
      manifestSha256: 'manifest-hash',
      partitionCount: 14,
      expectedTotalRecords: 1,
      parsedTotalRecords: 1,
    })
    expect(secondSummary.rxnorm).toMatchObject({
      verifiedSeedCount: 279,
      verifiedSeedSha256: 'seed-hash',
    })
  })

  test('candidate output path is gitignored', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
    const result = spawnSync(
      'git',
      [
        'check-ignore',
        '--quiet',
        '--',
        'packages/etl/data/clinical/openfda/extracted/output.jsonl.gz',
      ],
      { cwd: repoRoot },
    )
    expect(result.status).toBe(0)
  })

  test('DB size guard remains below one GiB', () => {
    expect(
      evaluateClinicalDatabaseFootprint({
        database_bytes: DATABASE_HARD_LIMIT_BYTES - 1,
        mapping_table_bytes: 0,
        mapping_index_bytes: 0,
      }).withinHardLimit,
    ).toBe(true)
  })
})
