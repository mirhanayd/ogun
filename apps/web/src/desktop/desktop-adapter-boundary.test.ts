import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const adapterDirectory = dirname(fileURLToPath(import.meta.url))
const adapterFiles = readdirSync(adapterDirectory).filter((name) => /adapter.*\.tsx$/.test(name))
const forbiddenIntrinsicElements = new Set(['form', 'input', 'select', 'textarea', 'table'])

describe('desktop adapter presentation boundary', () => {
  it.each(adapterFiles)('%s binds repositories without composing feature UI primitives', (name) => {
    const path = join(adapterDirectory, name)
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const forbiddenImports: string[] = []
    const forbiddenElements: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('@/components/ui/')) forbiddenImports.push(node.moduleSpecifier.text)
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && forbiddenIntrinsicElements.has(node.tagName.text)) forbiddenElements.push(node.tagName.text)
      ts.forEachChild(node, visit)
    }
    visit(source)
    expect(forbiddenImports, `${name} imports UI primitives`).toEqual([])
    expect(forbiddenElements, `${name} creates an alternate product form/table`).toEqual([])
  })
})
