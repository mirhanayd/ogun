import { sql, type InferInsertModel } from 'drizzle-orm'
import type { Database } from '@ogun/db'
import { clinicalSources } from '@ogun/db/schema'

type ClinicalSourceInsert = InferInsertModel<typeof clinicalSources>

export const RXNORM_SOURCE: ClinicalSourceInsert = {
  id: 'RXNORM_CPC',
  code: 'RXNORM_CPC',
  name: 'NLM RxNorm Current Prescribable Content',
  version: '2026-08-03',
  license: 'No license required; NLM RxNorm terms apply',
  citation: 'U.S. National Library of Medicine, RxNorm Current Prescribable Content',
  url: 'https://www.nlm.nih.gov/research/umls/rxnorm/docs/termsofservice.html',
  reuseStatus: 'public-domain-compatible-cpc-subset',
  metadata: {
    rawStorage: 'filesystem-only',
    databasePayload: 'reviewed crosswalk metadata only',
    ttyScope: ['IN', 'PIN', 'MIN'],
  },
}

export const OPENFDA_DRUG_LABEL_SOURCE: ClinicalSourceInsert = {
  id: 'OPENFDA_DRUG_LABEL',
  code: 'OPENFDA_DRUG_LABEL',
  name: 'FDA Drug Label / Structured Product Labeling',
  version: 'continuous',
  license: 'CC0 / U.S. public domain terms',
  citation: 'U.S. Food and Drug Administration, openFDA Drug Label API downloads',
  url: 'https://open.fda.gov/data/downloads/',
  reuseStatus: 'cc0-public-domain',
  metadata: {
    rawStorage: 'filesystem-only',
    databasePayload: 'none',
    downloadManifest: 'https://api.fda.gov/download.json',
  },
}

export const CLINICAL_TERMINOLOGY_SOURCES = [RXNORM_SOURCE, OPENFDA_DRUG_LABEL_SOURCE] as const

export async function registerClinicalTerminologySources(db: Database) {
  for (const source of CLINICAL_TERMINOLOGY_SOURCES) {
    await db
      .insert(clinicalSources)
      .values(source)
      .onConflictDoUpdate({
        target: clinicalSources.id,
        set: {
          code: source.code,
          name: source.name,
          version: source.version,
          license: source.license,
          citation: source.citation,
          url: source.url,
          reuseStatus: source.reuseStatus,
          metadata: source.metadata,
          updatedAt: new Date(),
        },
        setWhere: sql`(
          ${clinicalSources.code},
          ${clinicalSources.name},
          ${clinicalSources.version},
          ${clinicalSources.license},
          ${clinicalSources.citation},
          ${clinicalSources.url},
          ${clinicalSources.reuseStatus},
          ${clinicalSources.metadata}
        ) is distinct from (
          excluded.code,
          excluded.name,
          excluded.version,
          excluded.license,
          excluded.citation,
          excluded.url,
          excluded.reuse_status,
          excluded.metadata
        )`,
      })
  }
}
