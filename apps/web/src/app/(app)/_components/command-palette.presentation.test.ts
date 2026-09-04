import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./command-palette.tsx', import.meta.url), 'utf8')

describe('command palette presentation', () => {
  it('renders search results as an anchored panel instead of a modal dialog', () => {
    expect(source).not.toContain('CommandDialog')
    expect(source).toContain('data-command-trigger')
    expect(source).toContain('data-command-panel')
    expect(source).toContain('absolute top-[calc(100%+0.375rem)]')
  })

  it('opens from the real input and registers the shared Ctrl+K shortcut', () => {
    expect(source).toContain('onFocus={() => setOpen(true)}')
    expect(source).toContain('registerCommandShortcutTarget')
  })
})
