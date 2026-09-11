import { createHash } from 'node:crypto'

export type DatabaseWriteOperation =
  'migrate' | 'push' | 'seed' | 'demo-seed' | 'etl' | 'write-test' | 'admin'

export interface DatabaseTarget {
  hostname: string
  port: string
  database: string
  isLocal: boolean
  isRemote: boolean
  sanitizedDisplay: string
  fingerprint: string
}

export interface DatabaseWriteGuardOptions {
  operation: DatabaseWriteOperation
  databaseUrl?: string
  env?: NodeJS.ProcessEnv
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const REMOTE_DENIED_OPERATIONS = new Set<DatabaseWriteOperation>([
  'push',
  'seed',
  'demo-seed',
  'write-test',
])

function requiredExplicitUrl(databaseUrl?: string): string {
  if (!databaseUrl?.trim()) throw new Error('DATABASE_URL is not explicitly set')
  return databaseUrl
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function createFingerprint(value: string): string {
  const valueHash = createHash('sha256').update(value).digest('hex').slice(0, 8).toUpperCase()
  return `${valueHash.slice(0, 4)}-${valueHash.slice(4)}`
}

export function parseDatabaseTarget(databaseUrl?: string): DatabaseTarget {
  const explicitUrl = requiredExplicitUrl(databaseUrl)
  let parsed: URL
  try {
    parsed = new URL(explicitUrl)
  } catch {
    throw new Error('DATABASE_URL is not a valid PostgreSQL connection URL')
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol')
  }

  const hostname = normalizeHostname(parsed.hostname)
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!hostname || !database) {
    throw new Error('DATABASE_URL must include an explicit hostname and database name')
  }

  const port = parsed.port || '5432'
  const displayHost = hostname.includes(':') ? `[${hostname}]` : hostname
  const sanitizedDisplay = `postgresql://${displayHost}:${port}/${database}`

  const isLocal = LOCAL_HOSTS.has(hostname)
  return {
    hostname,
    port,
    database,
    isLocal,
    isRemote: !isLocal,
    sanitizedDisplay,
    fingerprint: createFingerprint(sanitizedDisplay),
  }
}

export function describeDatabaseTarget(target: DatabaseTarget): string[] {
  return [
    `Database target: ${target.sanitizedDisplay}`,
    `Target class: ${target.isLocal ? 'local' : 'remote'}`,
    `Target fingerprint: ${target.fingerprint}`,
  ]
}

export function describeDatabaseWritePolicy(
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (target.isLocal) return ['Remote write opt-in: not required for a local target']
  const environment = env.DB_WRITE_TARGET
  return [
    `Remote write opt-in: ${env.DB_ALLOW_REMOTE_WRITE === 'true' ? 'present' : 'missing'}`,
    `Requested environment: ${environment === 'staging' || environment === 'production' ? environment : 'invalid/missing'}`,
    `Expected host match: ${normalizeHostname(env.DB_EXPECTED_HOST ?? '') === target.hostname ? 'yes' : 'no'}`,
    `Expected database match: ${(env.DB_EXPECTED_DATABASE ?? '') === target.database ? 'yes' : 'no'}`,
    ...(environment === 'production'
      ? [
          `Production fingerprint match: ${env.DB_PRODUCTION_WRITE_CONFIRM === target.fingerprint ? 'yes' : 'no'}`,
        ]
      : []),
  ]
}

export function assertLocalDatabaseTarget(
  databaseUrl: string | undefined,
  label = 'database write tests',
) {
  const target = parseDatabaseTarget(databaseUrl)
  if (!target.isLocal) {
    throw new Error(`${label} may only target localhost, 127.0.0.1, or ::1`)
  }
  return target
}

export function assertDatabaseWriteTarget(options: DatabaseWriteGuardOptions): DatabaseTarget {
  const env = options.env ?? process.env
  const target = parseDatabaseTarget(options.databaseUrl)
  if (target.isLocal) return target

  if (REMOTE_DENIED_OPERATIONS.has(options.operation)) {
    throw new Error(`${options.operation} is denied for every remote database target`)
  }
  if (env.DB_ALLOW_REMOTE_WRITE !== 'true') {
    throw new Error('Remote database write denied: DB_ALLOW_REMOTE_WRITE must be exactly true')
  }

  const environment = env.DB_WRITE_TARGET
  if (environment !== 'staging' && environment !== 'production') {
    throw new Error('Remote database write denied: DB_WRITE_TARGET must be staging or production')
  }
  if (normalizeHostname(env.DB_EXPECTED_HOST ?? '') !== target.hostname) {
    throw new Error(
      'Remote database write denied: DB_EXPECTED_HOST does not match the parsed target',
    )
  }
  if ((env.DB_EXPECTED_DATABASE ?? '') !== target.database) {
    throw new Error(
      'Remote database write denied: DB_EXPECTED_DATABASE does not match the parsed target',
    )
  }
  if (environment === 'production' && env.DB_PRODUCTION_WRITE_CONFIRM !== target.fingerprint) {
    throw new Error(
      `Production database write denied: DB_PRODUCTION_WRITE_CONFIRM must equal target fingerprint ${target.fingerprint}`,
    )
  }
  return target
}
