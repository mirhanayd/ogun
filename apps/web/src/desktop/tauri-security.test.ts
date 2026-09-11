import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync(new URL('../../../desktop/src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const capability = JSON.parse(readFileSync(new URL('../../../desktop/src-tauri/capabilities/default.json', import.meta.url), 'utf8'))

describe('Tauri static security policy', () => {
  it('enforces a CSP and does not grant shell or broad filesystem defaults', () => {
    expect(config.app.security.csp).toContain("default-src 'self'")
    expect(config.app.security.csp).toContain("object-src 'none'")
    const serialized = JSON.stringify(capability.permissions)
    expect(serialized).not.toContain('shell:')
    expect(serialized).not.toContain('fs:default')
    expect(serialized).not.toContain('opener:default')
  })

  it('keeps production UI local and scopes external opener schemes', () => {
    expect(capability.local).toBe(true)
    expect(capability.remote.urls).not.toContain('https://ogun-web.vercel.app/*')
    const opener = capability.permissions.find((entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'identifier' in entry && entry.identifier === 'opener:allow-open-url')
    expect(opener.allow.every(({ url }: { url: string }) =>
      url.startsWith('https://') || url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1'))).toBe(true)
  })

  it('leaves updater disabled until a signed release supplies a key and endpoint', () => {
    expect(config.plugins.updater.pubkey).toBe('')
    expect(config.plugins.updater.endpoints).toEqual([])
  })
})
