#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

function command(program, args) {
  return execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

const migrations = readdirSync(new URL('../packages/db/drizzle/', import.meta.url))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
const desktop = JSON.parse(readFileSync(new URL('../apps/desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const manifest = {
  gitSha: command('git', ['rev-parse', 'HEAD']),
  node: process.version,
  pnpm: process.platform === 'win32'
    ? command('cmd.exe', ['/d', '/s', '/c', 'pnpm --version'])
    : command('pnpm', ['--version']),
  repositoryMigrationLatest: migrations.at(-1)?.replace(/\.sql$/, '') ?? null,
  webBuild: 'validated-by-release-check',
  adminBuild: 'validated-by-release-check',
  desktopVersion: desktop.version,
}
console.log(JSON.stringify(manifest, null, 2))
