import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const tsxCli = resolve(repoRoot, 'packages', 'db', 'node_modules', 'tsx', 'dist', 'cli.mjs')
const migrateScript = resolve(repoRoot, 'packages', 'db', 'src', 'scripts', 'migrate.ts')
const temporaryDirectories: string[] = []

function guardedEnvironment(extra: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env, ...extra }
  for (const key of [
    'DATABASE_URL',
    'DB_ALLOW_REMOTE_WRITE',
    'DB_WRITE_TARGET',
    'DB_EXPECTED_HOST',
    'DB_EXPECTED_DATABASE',
    'DB_PRODUCTION_WRITE_CONFIRM',
  ]) {
    delete env[key]
  }
  return { ...env, ...extra }
}

function runMigrate(cwd: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [tsxCli, migrateScript], {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 15_000,
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

describe('migration process guard', () => {
  it('ignores a remote-looking root .env and fails before any network attempt', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'ogun-db-guard-'))
    temporaryDirectories.push(directory)
    writeFileSync(directory + '/.env', 'DATABASE_URL=postgresql://user:pass@remote.invalid/ogun\n')

    const result = runMigrate(directory, guardedEnvironment())
    const output = `${result.stdout}${result.stderr}`
    expect(result.status).not.toBe(0)
    expect(output).toContain('DATABASE_URL is not explicitly set')
    expect(output).not.toMatch(/ENOTFOUND|ECONNREFUSED|Reading config file/i)
  })

  it('rejects an explicit fake remote target before any network attempt', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'ogun-db-guard-'))
    temporaryDirectories.push(directory)
    const result = runMigrate(
      directory,
      guardedEnvironment({ DATABASE_URL: 'postgresql://user:pass@remote.invalid:5432/ogun' }),
    )
    const output = `${result.stdout}${result.stderr}`
    expect(result.status).not.toBe(0)
    expect(output).toContain('DB_ALLOW_REMOTE_WRITE')
    expect(output).not.toContain('pass')
    expect(output).not.toMatch(/ENOTFOUND|ECONNREFUSED|Reading config file/i)
  })
})
