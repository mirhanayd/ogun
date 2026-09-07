import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type {
  CandidateDetailBundle,
  CompactSnapshotIndex,
} from './clinical-review-web-bundle'
import type {
  OpenFdaCandidateEvidence,
  OpenFdaInteractionCandidate,
} from './openfda-types'

export interface ClinicalReviewArtifactStore {
  getSnapshotIndex(semanticHash: string): Promise<CompactSnapshotIndex | null>
  getCandidateDetail(candidateId: string, semanticHash?: string): Promise<CandidateDetailBundle | null>
  getCandidate(candidateId: string, semanticHash?: string): Promise<OpenFdaInteractionCandidate | null>
  getCandidateEvidence(candidateId: string, semanticHash?: string): Promise<OpenFdaCandidateEvidence[]>
  putReviewBundle(options: {
    semanticHash: string
    index: CompactSnapshotIndex
    candidateBundles: Map<string, CandidateDetailBundle>
  }): Promise<void>
  exists(candidateId: string, semanticHash?: string): Promise<boolean>
}

/**
 * Local filesystem adapter for development and testing.
 */
export class FilesystemArtifactStore implements ClinicalReviewArtifactStore {
  constructor(private readonly bundlesDir: string) {}

  private resolveSnapshotDir(semanticHash?: string): string | null {
    if (semanticHash) {
      const candidateDir = path.join(this.bundlesDir, 'snapshots', semanticHash)
      if (existsSync(candidateDir)) return candidateDir
    }

    const snapshotsRoot = path.join(this.bundlesDir, 'snapshots')
    if (!existsSync(snapshotsRoot)) return null

    // Look for any directory inside snapshots
    const entries = existsSync(snapshotsRoot) ? path.join(this.bundlesDir, 'snapshots') : null
    return entries
  }

  async getSnapshotIndex(semanticHash: string): Promise<CompactSnapshotIndex | null> {
    const indexPath = path.join(this.bundlesDir, 'snapshots', semanticHash, 'index.json')
    if (existsSync(indexPath)) {
      return JSON.parse(readFileSync(indexPath, 'utf8')) as CompactSnapshotIndex
    }

    const indexGzPath = path.join(this.bundlesDir, 'snapshots', semanticHash, 'index.json.gz')
    if (existsSync(indexGzPath)) {
      const decompressed = gunzipSync(readFileSync(indexGzPath)).toString('utf8')
      return JSON.parse(decompressed) as CompactSnapshotIndex
    }

    return null
  }

  async getCandidateDetail(
    candidateId: string,
    semanticHash?: string,
  ): Promise<CandidateDetailBundle | null> {
    const snapshotsRoot = path.join(this.bundlesDir, 'snapshots')
    if (!existsSync(snapshotsRoot)) return null

    // If semanticHash is provided, look in that specific snapshot
    const hashDirs = semanticHash
      ? [semanticHash]
      : ['4b971d4a85f3eb2a75066266e9f4154bbe0f91c0802167fc7fded28e76aabbdd']

    for (const hash of hashDirs) {
      const candidateGz = path.join(
        snapshotsRoot,
        hash,
        'candidates',
        `${candidateId}.json.gz`,
      )
      if (existsSync(candidateGz)) {
        const decompressed = gunzipSync(readFileSync(candidateGz)).toString('utf8')
        return JSON.parse(decompressed) as CandidateDetailBundle
      }

      const candidateJson = path.join(
        snapshotsRoot,
        hash,
        'candidates',
        `${candidateId}.json`,
      )
      if (existsSync(candidateJson)) {
        return JSON.parse(readFileSync(candidateJson, 'utf8')) as CandidateDetailBundle
      }
    }

    return null
  }

  async getCandidate(
    candidateId: string,
    semanticHash?: string,
  ): Promise<OpenFdaInteractionCandidate | null> {
    const detail = await this.getCandidateDetail(candidateId, semanticHash)
    return detail?.candidate ?? null
  }

  async getCandidateEvidence(
    candidateId: string,
    semanticHash?: string,
  ): Promise<OpenFdaCandidateEvidence[]> {
    const detail = await this.getCandidateDetail(candidateId, semanticHash)
    return detail?.evidenceList ?? []
  }

  async exists(candidateId: string, semanticHash?: string): Promise<boolean> {
    const detail = await this.getCandidateDetail(candidateId, semanticHash)
    return detail !== null
  }

  async putReviewBundle(options: {
    semanticHash: string
    index: CompactSnapshotIndex
    candidateBundles: Map<string, CandidateDetailBundle>
  }): Promise<void> {
    const snapshotDir = path.join(this.bundlesDir, 'snapshots', options.semanticHash)
    const candidatesDir = path.join(snapshotDir, 'candidates')
    mkdirSync(candidatesDir, { recursive: true })

    const indexJson = JSON.stringify(options.index, null, 2)
    writeFileSync(path.join(snapshotDir, 'index.json'), indexJson)
    writeFileSync(path.join(snapshotDir, 'index.json.gz'), gzipSync(indexJson, { level: 9 }))

    for (const [id, bundle] of options.candidateBundles.entries()) {
      const bundleJson = JSON.stringify(bundle)
      writeFileSync(
        path.join(candidatesDir, `${id}.json.gz`),
        gzipSync(bundleJson, { level: 9 }),
      )
    }
  }
}

/**
 * Vercel Blob storage adapter for production serverless deployment.
 */
export class VercelBlobArtifactStore implements ClinicalReviewArtifactStore {
  constructor(private readonly token: string) {}

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.token}`,
    }
  }

  async getSnapshotIndex(semanticHash: string): Promise<CompactSnapshotIndex | null> {
    try {
      const url = `https://blob.vercel-storage.com/clinical-review/snapshots/${semanticHash}/index.json`
      const res = await fetch(url, { headers: this.getHeaders() })
      if (!res.ok) return null
      return (await res.json()) as CompactSnapshotIndex
    } catch {
      return null
    }
  }

  async getCandidateDetail(
    candidateId: string,
    semanticHash = '4b971d4a85f3eb2a75066266e9f4154bbe0f91c0802167fc7fded28e76aabbdd',
  ): Promise<CandidateDetailBundle | null> {
    try {
      const url = `https://blob.vercel-storage.com/clinical-review/snapshots/${semanticHash}/candidates/${candidateId}.json`
      const res = await fetch(url, { headers: this.getHeaders() })
      if (!res.ok) return null
      return (await res.json()) as CandidateDetailBundle
    } catch {
      return null
    }
  }

  async getCandidate(
    candidateId: string,
    semanticHash?: string,
  ): Promise<OpenFdaInteractionCandidate | null> {
    const detail = await this.getCandidateDetail(candidateId, semanticHash)
    return detail?.candidate ?? null
  }

  async getCandidateEvidence(
    candidateId: string,
    semanticHash?: string,
  ): Promise<OpenFdaCandidateEvidence[]> {
    const detail = await this.getCandidateDetail(candidateId, semanticHash)
    return detail?.evidenceList ?? []
  }

  async exists(candidateId: string, semanticHash?: string): Promise<boolean> {
    const detail = await this.getCandidateDetail(candidateId, semanticHash)
    return detail !== null
  }

  async putReviewBundle(options: {
    semanticHash: string
    index: CompactSnapshotIndex
    candidateBundles: Map<string, CandidateDetailBundle>
  }): Promise<void> {
    // Put index
    const indexUrl = `https://blob.vercel-storage.com/clinical-review/snapshots/${options.semanticHash}/index.json`
    await fetch(indexUrl, {
      method: 'PUT',
      headers: {
        ...this.getHeaders(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(options.index),
    })

    // Put candidate bundles
    for (const [id, bundle] of options.candidateBundles.entries()) {
      const candidateUrl = `https://blob.vercel-storage.com/clinical-review/snapshots/${options.semanticHash}/candidates/${id}.json`
      await fetch(candidateUrl, {
        method: 'PUT',
        headers: {
          ...this.getHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify(bundle),
      })
    }
  }
}

/**
 * Creates the appropriate artifact store based on environment configuration.
 */
export function createClinicalReviewArtifactStore(options?: {
  baseDir?: string
  blobToken?: string
}): ClinicalReviewArtifactStore {
  const blobToken = options?.blobToken || process.env.BLOB_READ_WRITE_TOKEN
  if (blobToken && !options?.baseDir) {
    return new VercelBlobArtifactStore(blobToken)
  }

  const baseDir =
    options?.baseDir ||
    path.resolve(process.cwd(), 'packages/etl/data/clinical/openfda/bundles')

  return new FilesystemArtifactStore(baseDir)
}
