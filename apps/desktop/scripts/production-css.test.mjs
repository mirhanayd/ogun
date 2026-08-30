import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const assetsDirectory = fileURLToPath(new URL('../dist/assets/', import.meta.url))

async function productionCss() {
  const files = (await readdir(assetsDirectory)).filter((file) => file.endsWith('.css'))
  assert.ok(files.length > 0, 'desktop production build did not emit a CSS asset')
  return Promise.all(files.map((file) => readFile(join(assetsDirectory, file), 'utf8')))
    .then((parts) => parts.join('\n'))
}

const representativeUtilities = [
  ['flex', String.raw`\.flex(?=[,{])`],
  ['grid', String.raw`\.grid(?=[,{])`],
  ['w-60', String.raw`\.w-60(?=[,{])`],
  ['rounded-xl', String.raw`\.rounded-xl(?=[,{])`],
  ['gap-3', String.raw`\.gap-3(?=[,{])`],
  ['md:flex', String.raw`\.md\\\:flex(?=[,{])`],
  ['h-svh', String.raw`\.h-svh(?=[,{])`],
  ['bg-sidebar', String.raw`\.bg-sidebar(?=[,{])`],
  ['text-muted-foreground', String.raw`\.text-muted-foreground(?=[,{])`],
]

test('desktop production CSS contains shared application utilities', async () => {
  const css = await productionCss()
  for (const [utility, selector] of representativeUtilities) {
    assert.match(css, new RegExp(selector), `missing generated utility: ${utility}`)
  }
})
