import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const OPENFDA_DOWNLOAD_MANIFEST_URL = 'https://api.fda.gov/download.json'
export const DEFAULT_OPENFDA_LABEL_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/clinical/openfda/drug-label',
)

export type OpenFdaPartition = {
  displayName: string
  url: string
  fileName: string
  sizeMb: number
  records: number
}

type RemoteManifest = {
  meta?: { last_updated?: string }
  results?: {
    drug?: {
      label?: {
        export_date?: string
        total_records?: number
        partitions?: Array<{
          display_name?: unknown
          file?: unknown
          size_mb?: unknown
          records?: unknown
        }>
      }
    }
  }
}

export type PinnedOpenFdaManifest = {
  schemaVersion: 1
  sourceManifestUrl: typeof OPENFDA_DOWNLOAD_MANIFEST_URL
  sourceLastUpdated: string | null
  labelExportDate: string | null
  totalRecords: number
  partitions: OpenFdaPartition[]
  fetchedAt: string
  manifestSha256: string
}

export type LocalFileRecord = OpenFdaPartition & {
  status: 'pending' | 'verified' | 'reused'
  bytes?: number
  sha256?: string
  completedAt?: string
  pinnedExportDate?: string | null
}

export type LocalOpenFdaManifest = {
  schemaVersion: 2
  sourceManifestUrl: string
  sourceLastUpdated: string | null
  labelExportDate: string | null
  totalRecords: number
  fetchedAt: string
  snapshotFile: string
  manifestSha256: string
  rawStorage: 'filesystem-only'
  databaseImported: false
  files: LocalFileRecord[]
}

export function parseDrugLabelManifest(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('openFDA manifest JSON object değil')
  const manifest = input as RemoteManifest
  const label = manifest.results?.drug?.label
  if (!label || !Array.isArray(label.partitions)) {
    throw new Error('openFDA manifest içinde results.drug.label.partitions yok')
  }

  const partitions = label.partitions.map((partition, index): OpenFdaPartition => {
    if (
      typeof partition.display_name !== 'string' ||
      typeof partition.file !== 'string' ||
      typeof partition.size_mb !== 'string' ||
      typeof partition.records !== 'number'
    ) {
      throw new Error(`openFDA drug.label partition ${index + 1} geçersiz`)
    }
    const url = new URL(partition.file)
    if (url.protocol !== 'https:' || url.hostname !== 'download.open.fda.gov') {
      throw new Error(`İzin verilmeyen openFDA download URL: ${partition.file}`)
    }
    const fileName = path.posix.basename(url.pathname)
    if (!/^drug-label-\d{4}-of-\d{4}\.json\.zip$/.test(fileName)) {
      throw new Error(`Beklenmeyen openFDA label dosya adı: ${fileName}`)
    }
    const sizeMb = Number(partition.size_mb)
    if (!Number.isFinite(sizeMb) || sizeMb <= 0 || partition.records < 0) {
      throw new Error(`openFDA drug.label partition ${index + 1} sayımları geçersiz`)
    }
    return {
      displayName: partition.display_name,
      url: partition.file,
      fileName,
      sizeMb,
      records: partition.records,
    }
  })

  if (new Set(partitions.map((item) => item.fileName)).size !== partitions.length) {
    throw new Error('openFDA drug.label manifest duplicate dosya adı içeriyor')
  }
  return {
    sourceLastUpdated: manifest.meta?.last_updated ?? null,
    exportDate: label.export_date ?? null,
    totalRecords: label.total_records ?? partitions.reduce((sum, item) => sum + item.records, 0),
    partitions,
  }
}

export async function sha256File(filePath: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

function snapshotPayload(input: {
  sourceLastUpdated: string | null
  exportDate: string | null
  totalRecords: number
  partitions: OpenFdaPartition[]
}) {
  return {
    schemaVersion: 1 as const,
    sourceManifestUrl: OPENFDA_DOWNLOAD_MANIFEST_URL as typeof OPENFDA_DOWNLOAD_MANIFEST_URL,
    sourceLastUpdated: input.sourceLastUpdated,
    labelExportDate: input.exportDate,
    totalRecords: input.totalRecords,
    partitions: input.partitions,
  }
}

export function createPinnedOpenFdaManifest(
  parsed: ReturnType<typeof parseDrugLabelManifest>,
  fetchedAt = new Date().toISOString(),
): PinnedOpenFdaManifest {
  const payload = snapshotPayload(parsed)
  const manifestSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return { ...payload, fetchedAt, manifestSha256 }
}

export function verifyPinnedOpenFdaManifest(snapshot: PinnedOpenFdaManifest) {
  const expected = createHash('sha256')
    .update(
      JSON.stringify(
        snapshotPayload({
          sourceLastUpdated: snapshot.sourceLastUpdated,
          exportDate: snapshot.labelExportDate,
          totalRecords: snapshot.totalRecords,
          partitions: snapshot.partitions,
        }),
      ),
    )
    .digest('hex')
  if (snapshot.manifestSha256 !== expected) {
    throw new Error('Pinned openFDA manifest SHA-256 doğrulaması başarısız')
  }
  return expected
}

export function pinOpenFdaManifest(outputDir: string, snapshot: PinnedOpenFdaManifest) {
  verifyPinnedOpenFdaManifest(snapshot)
  const manifestDir = path.join(outputDir, 'manifest')
  mkdirSync(manifestDir, { recursive: true })
  const exportName = (snapshot.labelExportDate ?? 'unknown').replace(/[^0-9A-Za-z.-]/g, '_')
  const fileName = `openfda-drug-label-manifest-${exportName}-${snapshot.manifestSha256.slice(0, 12)}.json`
  const destination = path.join(manifestDir, fileName)
  if (existsSync(destination)) {
    const existing = JSON.parse(readFileSync(destination, 'utf8')) as PinnedOpenFdaManifest
    verifyPinnedOpenFdaManifest(existing)
    if (existing.manifestSha256 !== snapshot.manifestSha256) {
      throw new Error('Immutable openFDA manifest snapshot çakışması')
    }
    return { snapshot: existing, destination, fileName, reused: true }
  }
  const temporary = `${destination}.tmp`
  writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  renameSync(temporary, destination)
  return { snapshot, destination, fileName, reused: false }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export async function downloadPartition(
  partition: OpenFdaPartition,
  outputDir: string,
  options: { retries?: number; fetchImpl?: typeof fetch } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 4
  const destination = path.join(outputDir, partition.fileName)
  const partial = `${destination}.part`

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const partialBytes = existsSync(partial) ? statSync(partial).size : 0
      const response = await fetchImpl(partition.url, {
        headers: partialBytes > 0 ? { Range: `bytes=${partialBytes}-` } : {},
      })
      if (response.status === 416 && partialBytes > 0) {
        const expectedTotal = response.headers.get('content-range')?.match(/\*\/(\d+)$/)?.[1]
        if (!expectedTotal || partialBytes !== Number(expectedTotal)) {
          throw new Error(`Resume aralığı reddedildi; partial dosya boyutu doğrulanamadı`)
        }
        renameSync(partial, destination)
        return { destination, resumedFrom: partialBytes, bytes: partialBytes }
      }
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const resumed = partialBytes > 0 && response.status === 206
      await pipeline(
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(partial, { flags: resumed ? 'a' : 'w' }),
      )
      const finalBytes = statSync(partial).size
      const expectedTotal = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
      if (expectedTotal && finalBytes !== Number(expectedTotal)) {
        throw new Error(`Eksik indirme: ${finalBytes}/${expectedTotal} byte`)
      }
      if (!resumed) {
        const contentLength = Number(response.headers.get('content-length'))
        if (Number.isFinite(contentLength) && contentLength > 0 && finalBytes !== contentLength) {
          throw new Error(`Eksik indirme: ${finalBytes}/${contentLength} byte`)
        }
      }
      renameSync(partial, destination)
      return { destination, resumedFrom: resumed ? partialBytes : 0, bytes: finalBytes }
    } catch (error) {
      if (attempt === retries) throw error
      await wait(Math.min(1_000 * 2 ** attempt, 15_000))
    }
  }
  throw new Error('openFDA indirme retry döngüsü beklenmedik biçimde sonlandı')
}

function writeLocalManifest(outputDir: string, manifest: LocalOpenFdaManifest) {
  const destination = path.join(outputDir, 'download-manifest.json')
  const temporary = `${destination}.tmp`
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  renameSync(temporary, destination)
}

function readPreviousManifest(outputDir: string) {
  const manifestPath = path.join(outputDir, 'download-manifest.json')
  if (!existsSync(manifestPath)) return null
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as Partial<LocalOpenFdaManifest>
}

async function replaceStalePartition(partition: OpenFdaPartition, outputDir: string) {
  const destination = path.join(outputDir, partition.fileName)
  if (!existsSync(destination)) return downloadPartition(partition, outputDir)
  const stale = `${destination}.stale`
  if (existsSync(stale)) throw new Error(`${partition.fileName}: stale backup zaten var`)
  renameSync(destination, stale)
  try {
    const downloaded = await downloadPartition(partition, outputDir)
    unlinkSync(stale)
    return downloaded
  } catch (error) {
    if (!existsSync(destination) && existsSync(stale)) renameSync(stale, destination)
    throw error
  }
}

function positiveIntegerArgument(prefix: string) {
  const argument = process.argv.slice(2).find((item) => item.startsWith(prefix))
  if (!argument) return null
  const value = Number(argument.slice(prefix.length))
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${prefix} pozitif tam sayı olmalı`)
  return value
}

export async function runOpenFdaDownloader() {
  const outputArgument = process.argv.slice(2).find((item) => item.startsWith('--dir='))
  const outputDir = outputArgument
    ? path.resolve(outputArgument.slice('--dir='.length))
    : DEFAULT_OPENFDA_LABEL_DIR
  const shouldDownload = process.argv.includes('--download')
  const all = process.argv.includes('--all')
  const part = positiveIntegerArgument('--part=')
  const maxFiles = positiveIntegerArgument('--max-files=')
  if (shouldDownload && !all && part === null && maxFiles === null) {
    throw new Error(
      'Toplu indirme için --all; sınırlı indirme için --part=N veya --max-files=N verin',
    )
  }

  mkdirSync(outputDir, { recursive: true })
  const response = await fetch(OPENFDA_DOWNLOAD_MANIFEST_URL)
  if (!response.ok) throw new Error(`openFDA manifest HTTP ${response.status}`)
  const parsed = parseDrugLabelManifest(await response.json())
  const pinned = pinOpenFdaManifest(outputDir, createPinnedOpenFdaManifest(parsed))
  const selected = part
    ? parsed.partitions.slice(part - 1, part)
    : maxFiles
      ? parsed.partitions.slice(0, maxFiles)
      : parsed.partitions
  if (part && selected.length === 0) throw new Error(`openFDA drug.label part ${part} yok`)

  const previous = readPreviousManifest(outputDir)
  const sameSnapshot = previous?.manifestSha256 === pinned.snapshot.manifestSha256
  const previousByUrl = new Map(
    (sameSnapshot ? previous?.files : [])?.map((file) => [file.url, file]) ?? [],
  )
  const local: LocalOpenFdaManifest = {
    schemaVersion: 2,
    sourceManifestUrl: OPENFDA_DOWNLOAD_MANIFEST_URL,
    sourceLastUpdated: pinned.snapshot.sourceLastUpdated,
    labelExportDate: pinned.snapshot.labelExportDate,
    totalRecords: pinned.snapshot.totalRecords,
    fetchedAt: pinned.snapshot.fetchedAt,
    snapshotFile: path.posix.join('manifest', pinned.fileName),
    manifestSha256: pinned.snapshot.manifestSha256,
    rawStorage: 'filesystem-only',
    databaseImported: false,
    files: parsed.partitions.map((partition) => {
      const old = previousByUrl.get(partition.url)
      return old ? { ...partition, ...old } : { ...partition, status: 'pending' }
    }),
  }

  for (const partition of selected) {
    const file = local.files.find((item) => item.url === partition.url)!
    const destination = path.join(outputDir, partition.fileName)
    const old = previousByUrl.get(partition.url)
    if (existsSync(destination) && !sameSnapshot) {
      if (!shouldDownload) continue
      const downloaded = await replaceStalePartition(partition, outputDir)
      Object.assign(file, {
        status: 'verified',
        bytes: downloaded.bytes,
        sha256: await sha256File(downloaded.destination),
        completedAt: new Date().toISOString(),
        pinnedExportDate: pinned.snapshot.labelExportDate,
      })
      writeLocalManifest(outputDir, local)
      continue
    }
    if (existsSync(destination) && old?.sha256) {
      const hash = await sha256File(destination)
      if (hash === old.sha256) {
        Object.assign(file, {
          status: 'reused',
          bytes: statSync(destination).size,
          sha256: hash,
          pinnedExportDate: pinned.snapshot.labelExportDate,
        })
        writeLocalManifest(outputDir, local)
        continue
      }
      throw new Error(`${partition.fileName}: mevcut dosya kayıtlı SHA-256 ile eşleşmiyor`)
    }
    if (existsSync(destination)) {
      throw new Error(
        `${partition.fileName}: checksum kaydı olmayan mevcut dosya üzerine yazılmayacak`,
      )
    }
    if (!shouldDownload) continue

    const downloaded = await downloadPartition(partition, outputDir)
    Object.assign(file, {
      status: 'verified',
      bytes: downloaded.bytes,
      sha256: await sha256File(downloaded.destination),
      completedAt: new Date().toISOString(),
      pinnedExportDate: pinned.snapshot.labelExportDate,
    })
    writeLocalManifest(outputDir, local)
  }

  writeLocalManifest(outputDir, local)
  return {
    outputDir,
    sourceLastUpdated: parsed.sourceLastUpdated,
    exportDate: parsed.exportDate,
    partitions: parsed.partitions.length,
    selected: selected.length,
    downloaded: local.files.filter((file) => file.status === 'verified').length,
    reused: local.files.filter((file) => file.status === 'reused').length,
    manifestSha256: pinned.snapshot.manifestSha256,
    snapshotFile: pinned.destination,
    manifestOnly: !shouldDownload,
  }
}

async function main() {
  console.log(JSON.stringify(await runOpenFdaDownloader(), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
