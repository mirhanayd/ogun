import { describe, expect, it } from 'vitest'
import {
  assertDatabaseWriteTarget,
  assertLocalDatabaseTarget,
  describeDatabaseTarget,
  describeDatabaseWritePolicy,
  parseDatabaseTarget,
} from './database-target'

const remoteUrl =
  'postgresql://secret-user:secret-password@ep-example.neon.tech:5432/ogun?sslmode=require'

describe('database target parsing', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('recognizes %s as local', (host) => {
    expect(parseDatabaseTarget(`postgresql://postgres:postgres@${host}:5432/ogun`).isLocal).toBe(
      true,
    )
  })

  it('treats public and Neon hosts as remote', () => {
    expect(parseDatabaseTarget(remoteUrl)).toMatchObject({ isLocal: false, isRemote: true })
    expect(parseDatabaseTarget('postgres://user:pass@db.example.com/app')).toMatchObject({
      isLocal: false,
      isRemote: true,
    })
  })

  it('never exposes credentials or query parameters', () => {
    const target = parseDatabaseTarget(remoteUrl)
    const output = describeDatabaseTarget(target).join('\n')
    expect(output).toContain('postgresql://ep-example.neon.tech:5432/ogun')
    expect(output).not.toContain('secret-user')
    expect(output).not.toContain('secret-password')
    expect(output).not.toContain('sslmode')
    expect(describeDatabaseWritePolicy(target, {}).join('\n')).not.toContain('secret')
  })
})

describe('database write policy', () => {
  it('requires an explicit URL', () => {
    expect(() => parseDatabaseTarget(undefined)).toThrow('DATABASE_URL is not explicitly set')
  })

  it('allows all guarded operations on an explicit local target', () => {
    const url = 'postgresql://postgres:postgres@localhost:5432/ogun'
    expect(assertDatabaseWriteTarget({ operation: 'migrate', databaseUrl: url }).isLocal).toBe(true)
    expect(assertLocalDatabaseTarget(url).isLocal).toBe(true)
  })

  it('denies a remote migration without an explicit opt-in', () => {
    expect(() =>
      assertDatabaseWriteTarget({ operation: 'migrate', databaseUrl: remoteUrl, env: {} }),
    ).toThrow('DB_ALLOW_REMOTE_WRITE')
  })

  it('denies host and database expectation mismatches', () => {
    const base = { DB_ALLOW_REMOTE_WRITE: 'true', DB_WRITE_TARGET: 'staging' }
    expect(() =>
      assertDatabaseWriteTarget({
        operation: 'migrate',
        databaseUrl: remoteUrl,
        env: { ...base, DB_EXPECTED_HOST: 'wrong.example.com', DB_EXPECTED_DATABASE: 'ogun' },
      }),
    ).toThrow('DB_EXPECTED_HOST')
    expect(() =>
      assertDatabaseWriteTarget({
        operation: 'migrate',
        databaseUrl: remoteUrl,
        env: { ...base, DB_EXPECTED_HOST: 'ep-example.neon.tech', DB_EXPECTED_DATABASE: 'wrong' },
      }),
    ).toThrow('DB_EXPECTED_DATABASE')
  })

  it('allows a matching staging migration', () => {
    expect(
      assertDatabaseWriteTarget({
        operation: 'migrate',
        databaseUrl: remoteUrl,
        env: {
          DB_ALLOW_REMOTE_WRITE: 'true',
          DB_WRITE_TARGET: 'staging',
          DB_EXPECTED_HOST: 'ep-example.neon.tech',
          DB_EXPECTED_DATABASE: 'ogun',
        },
      }).isLocal,
    ).toBe(false)
  })

  it('requires the displayed fingerprint for production', () => {
    const target = parseDatabaseTarget(remoteUrl)
    const environment = {
      DB_ALLOW_REMOTE_WRITE: 'true',
      DB_WRITE_TARGET: 'production',
      DB_EXPECTED_HOST: target.hostname,
      DB_EXPECTED_DATABASE: target.database,
    }
    expect(() =>
      assertDatabaseWriteTarget({ operation: 'migrate', databaseUrl: remoteUrl, env: environment }),
    ).toThrow(target.fingerprint)
    expect(
      assertDatabaseWriteTarget({
        operation: 'migrate',
        databaseUrl: remoteUrl,
        env: { ...environment, DB_PRODUCTION_WRITE_CONFIRM: target.fingerprint },
      }),
    ).toEqual(target)
  })

  it.each(['push', 'seed', 'demo-seed', 'write-test'] as const)(
    'always denies remote %s even when confirmation flags match',
    (operation) => {
      const target = parseDatabaseTarget(remoteUrl)
      expect(() =>
        assertDatabaseWriteTarget({
          operation,
          databaseUrl: remoteUrl,
          env: {
            DB_ALLOW_REMOTE_WRITE: 'true',
            DB_WRITE_TARGET: 'production',
            DB_EXPECTED_HOST: target.hostname,
            DB_EXPECTED_DATABASE: target.database,
            DB_PRODUCTION_WRITE_CONFIRM: target.fingerprint,
          },
        }),
      ).toThrow('denied for every remote database target')
    },
  )
})
