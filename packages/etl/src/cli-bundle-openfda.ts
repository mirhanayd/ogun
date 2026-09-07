import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateClinicalReviewWebBundles } from './clinical-review-web-bundle'

function main() {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const baseDir = path.resolve(packageDir, 'data/clinical/openfda')
  const outputDir = path.resolve(packageDir, 'data/clinical/openfda/bundles')

  console.log('Generating clinical review web bundles...')
  console.log(`Base directory: ${baseDir}`)
  console.log(`Output directory: ${outputDir}`)

  const result = generateClinicalReviewWebBundles({ baseDir, outputDir })

  console.log('\n--- Bundle Generation Complete ---')
  console.log(`Semantic hash: ${result.semanticHash}`)
  console.log(`Total candidates: ${result.index.totalCandidates}`)
  console.log('Priority breakdown:', result.index.counts)
  console.log(`Bundled candidate files: ${result.bundleFilesCount}`)
  console.log(`Total gzipped bundle size: ${(result.totalBytes / 1024).toFixed(2)} KB`)
}

main()
