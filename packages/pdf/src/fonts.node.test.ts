import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveFontFile } from './fonts.node'

describe('resolveFontFile', () => {
  it('düz Node ortamında paket içindeki file URL yolunu kullanır', () => {
    const url = new URL('./fonts/Inter-Regular.ttf', import.meta.url)
    const resolved = resolveFontFile(
      { fileName: 'Inter-Regular.ttf', url },
      {
        cwd: path.resolve('unused'),
        moduleDir: path.resolve('unused'),
        fileExists: () => false,
      },
    )

    expect(resolved).toBe(fileURLToPath(url))
  })

  it('Next.js bundled asset yolunu web uygulamasının .next dizininde bulur', () => {
    const cwd = path.resolve('test-fixtures', 'web')
    const assetPath = 'static/media/Inter-Regular.test.ttf'
    const expected = path.resolve(cwd, '.next', assetPath)

    const resolved = resolveFontFile(
      {
        fileName: 'Inter-Regular.ttf',
        url: { protocol: '', pathname: `/_next/${assetPath}` },
      },
      {
        cwd,
        moduleDir: path.resolve('test-fixtures', 'packages/pdf/src'),
        fileExists: (candidate) => candidate === expected,
      },
    )

    expect(resolved).toBe(expected)
  })

  it('Vercel/Docker monorepo kökünden izlenen public font kopyasına düşer', () => {
    const monorepoRoot = path.resolve('test-fixtures', 'deployment-root')
    const moduleDir = path.join(monorepoRoot, 'packages/pdf/src')
    const assetPath = 'static/media/Inter-Bold.test.ttf'
    const expected = path.join(monorepoRoot, 'apps/web/public/fonts/pdf/Inter-Bold.ttf')

    const resolved = resolveFontFile(
      {
        fileName: 'Inter-Bold.ttf',
        url: { protocol: '', pathname: `/_next/${assetPath}` },
      },
      {
        cwd: monorepoRoot,
        moduleDir,
        fileExists: (candidate) => candidate === expected,
      },
    )

    expect(resolved).toBe(expected)
  })
})
