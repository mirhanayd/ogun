import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { count, eq, sql } from 'drizzle-orm'
import {
  conditionAliases,
  conditionCategories,
  conditionCrosswalks,
  conditionExternalIds,
  conditionParents,
  conditions,
  medicationProducts,
  medicationProductSubstances,
  medicationSubstances,
} from '@ogun/db/schema'

type ValidationReport = {
  conditions: {
    canonical_conditions: number
    aliases: number
    parents: number
    external_ids: number
    crosswalks: number
    categories: number
    nci_ambiguous_kept_separate: number
    duplicate_condition_ids: number
    orphan_parents: number
  }
  medications: {
    licensed_source_rows: number
    licensed_products_after_safe_dedupe: number
    catalog_products: number
    selectable_products: number
    substance_phrases: number
    product_substance_links: number
    duplicate_product_ids: number
    product_substance_orphans: number
    erx_unmatched_count: number
    erx_ambiguous_collision_count: number
    source_duplicate_barcode_count: number
  }
}

type Manifest = {
  files: Array<{ name: string; rows: number | null }>
}

const EXPECTED_ACTIVE_CONDITIONS = 18_990

function resolveDataDir() {
  const arg = process.argv.slice(2).find((value) => value.startsWith('--dir='))
  return arg
    ? path.resolve(arg.slice('--dir='.length))
    : path.resolve(process.cwd(), 'data/clinical/processed')
}

function readSeedMetadata() {
  const dir = resolveDataDir()
  const required = ['manifest.json', 'validation_report.json']
  const missing = required.filter((name) => !existsSync(path.join(dir, name)))
  if (missing.length) {
    throw new Error(`Clinical doğrulama dosyaları eksik: ${missing.join(', ')}\nBeklenen klasör: ${dir}`)
  }
  return {
    manifest: JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest,
    report: JSON.parse(readFileSync(path.join(dir, 'validation_report.json'), 'utf8')) as ValidationReport,
  }
}

function scalar(result: unknown): number {
  const rows = result as Array<Record<string, unknown>>
  return Number(rows[0]?.value ?? 0)
}

function assertEqual(errors: string[], label: string, actual: number, expected: number) {
  const ok = actual === expected
  console.log(`${ok ? 'OK' : 'HATA'} ${label}: ${actual.toLocaleString('tr-TR')} (beklenen ${expected.toLocaleString('tr-TR')})`)
  if (!ok) errors.push(`${label}: ${actual}, beklenen ${expected}`)
}

function assertSpot(errors: string[], label: string, ok: boolean, detail: unknown) {
  console.log(`${ok ? 'OK' : 'HATA'} ${label}:`, detail)
  if (!ok) errors.push(label)
}

async function main() {
  const { manifest, report } = readSeedMetadata()
  const { db } = await import('@ogun/db')
  const errors: string[] = []

  try {
    const [
      conditionCount,
      activeConditionCount,
      aliasCount,
      parentCount,
      externalIdCount,
      crosswalkCount,
      categoryCount,
      productCount,
      selectableProductCount,
      substanceCount,
      productSubstanceCount,
      orphanParentCount,
      orphanProductSubstanceCount,
      duplicateBarcodeCount,
      ambiguousNciCount,
    ] = await Promise.all([
      db.select({ value: count() }).from(conditions),
      db.select({ value: count() }).from(conditions).where(eq(conditions.isActive, true)),
      db.select({ value: count() }).from(conditionAliases),
      db.select({ value: count() }).from(conditionParents),
      db.select({ value: count() }).from(conditionExternalIds),
      db.select({ value: count() }).from(conditionCrosswalks),
      db.select({ value: count() }).from(conditionCategories),
      db.select({ value: count() }).from(medicationProducts),
      db.select({ value: count() }).from(medicationProducts).where(eq(medicationProducts.isSelectable, true)),
      db.select({ value: count() }).from(medicationSubstances),
      db.select({ value: count() }).from(medicationProductSubstances),
      db.execute(sql`
        select count(*)::int as value
        from condition_parents relation
        left join conditions child on child.id = relation.child_condition_id
        left join conditions parent on parent.id = relation.parent_condition_id
        where child.id is null or parent.id is null
      `),
      db.execute(sql`
        select count(*)::int as value
        from medication_product_substances relation
        left join medication_products product on product.id = relation.medication_product_id
        left join medication_substances substance on substance.id = relation.medication_substance_id
        where product.id is null or substance.id is null
      `),
      db.execute(sql`
        select count(*)::int as value
        from (
          select barcode
          from medication_products
          where barcode is not null
          group by barcode
          having count(*) > 1
        ) duplicate_barcodes
      `),
      db.execute(sql`
        select count(distinct condition_id)::int as value
        from condition_crosswalks
        where mapping_status = 'ambiguous_source_xref'
      `),
    ])

    console.log('--- Ogun Clinical DB kesin sayım doğrulaması ---')
    assertEqual(errors, 'conditions', conditionCount[0]?.value ?? 0, report.conditions.canonical_conditions)
    assertEqual(errors, 'active conditions', activeConditionCount[0]?.value ?? 0, EXPECTED_ACTIVE_CONDITIONS)
    assertEqual(errors, 'condition aliases', aliasCount[0]?.value ?? 0, report.conditions.aliases)
    assertEqual(errors, 'condition parent links', parentCount[0]?.value ?? 0, report.conditions.parents)
    assertEqual(errors, 'condition external IDs', externalIdCount[0]?.value ?? 0, report.conditions.external_ids)
    assertEqual(errors, 'condition crosswalks', crosswalkCount[0]?.value ?? 0, report.conditions.crosswalks)
    assertEqual(errors, 'condition categories', categoryCount[0]?.value ?? 0, report.conditions.categories)
    assertEqual(errors, 'medication products', productCount[0]?.value ?? 0, report.medications.catalog_products)
    assertEqual(
      errors,
      'selectable medication products',
      selectableProductCount[0]?.value ?? 0,
      report.medications.selectable_products,
    )
    assertEqual(errors, 'medication substance expressions', substanceCount[0]?.value ?? 0, report.medications.substance_phrases)
    assertEqual(
      errors,
      'product–substance links',
      productSubstanceCount[0]?.value ?? 0,
      report.medications.product_substance_links,
    )
    assertEqual(errors, 'orphan condition parents', scalar(orphanParentCount), report.conditions.orphan_parents)
    assertEqual(
      errors,
      'orphan product–substance links',
      scalar(orphanProductSubstanceCount),
      report.medications.product_substance_orphans,
    )
    // 51, ham ruhsat dosyasında birden fazla satırda görülen barkod grubudur.
    // Güvenli dedupe 25 tamamen aynı ürün satırını birleştirir; canonical
    // katalogda kalan 26 grup gerçek, farklı ürün/ruhsat çakışmalarıdır.
    assertEqual(errors, 'source duplicate-barcode audit', report.medications.source_duplicate_barcode_count, 51)
    const safelyDedupedLicensedRows =
      report.medications.licensed_source_rows - report.medications.licensed_products_after_safe_dedupe
    const expectedCanonicalDuplicateBarcodes =
      report.medications.source_duplicate_barcode_count - safelyDedupedLicensedRows
    assertEqual(
      errors,
      'canonical catalog duplicate-barcode groups',
      scalar(duplicateBarcodeCount),
      expectedCanonicalDuplicateBarcodes,
    )
    assertEqual(
      errors,
      'ambiguous NCI concepts kept separate',
      scalar(ambiguousNciCount),
      report.conditions.nci_ambiguous_kept_separate,
    )

    const unmatchedAuditRows = manifest.files.find((file) => file.name === 'titck_erx_unmatched_audit.jsonl.gz')?.rows ?? -1
    const ambiguousAuditRows = manifest.files.find((file) => file.name === 'titck_erx_ambiguous_audit.jsonl.gz')?.rows ?? -1
    assertEqual(errors, 'SKRS unmatched audit rows', unmatchedAuditRows, report.medications.erx_unmatched_count)
    assertEqual(errors, 'SKRS ambiguous audit rows', ambiguousAuditRows, report.medications.erx_ambiguous_collision_count)

    const [t2dm] = await db.execute(sql`
      select c.id, c.name_tr, array_agg(distinct a.alias) filter (where a.alias is not null) as aliases
      from conditions c
      left join condition_aliases a on a.condition_id = c.id
      where c.source_code = 'DOID:9352'
      group by c.id, c.name_tr
      limit 1
    `)
    const t2dmAliases = ((t2dm as { aliases?: string[] } | undefined)?.aliases ?? []).map((value) => value.toLocaleLowerCase('tr-TR'))
    assertSpot(
      errors,
      'DOID:9352 Tip 2 diyabet ad/alias provenance',
      Boolean(t2dm) && t2dmAliases.some((value) => value.includes('tip 2 diyabet')),
      t2dm ?? 'YOK',
    )

    const [colorectal] = await db
      .select({ id: conditions.id, nameTr: conditions.nameTr, isNeoplasm: conditions.isNeoplasm })
      .from(conditions)
      .where(eq(conditions.sourceCode, 'DOID:9256'))
      .limit(1)
    assertSpot(
      errors,
      'DOID:9256 kolorektal kanser/neoplasm',
      Boolean(colorectal?.isNeoplasm && colorectal.nameTr.toLocaleLowerCase('tr-TR').includes('kolorektal')),
      colorectal ?? 'YOK',
    )

    const [glifor] = await db.execute(sql`
      select p.id, p.name, p.active_ingredient_raw, s.name_tr as substance_name
      from medication_products p
      inner join medication_product_substances relation on relation.medication_product_id = p.id
      inner join medication_substances s on s.id = relation.medication_substance_id
      where p.search_text like '%glifor%' and s.search_text like '%metformin%'
      order by p.is_selectable desc, p.name
      limit 1
    `)
    assertSpot(errors, 'GLIFOR → canonical metformin bağlantısı', Boolean(glifor), glifor ?? 'YOK')

    const onadron = await db.execute(sql`
      select distinct active_ingredient_raw
      from medication_products
      where search_text like '%onadron%'
        and active_ingredient_raw in ('deksametazon', 'dekzametazon')
      order by active_ingredient_raw
    `)
    const onadronSpellings = new Set(
      (onadron as unknown as Array<{ active_ingredient_raw: string }>).map((row) => row.active_ingredient_raw),
    )
    assertSpot(
      errors,
      'ONADRON deksametazon/dekzametazon provenance',
      onadronSpellings.has('deksametazon') && onadronSpellings.has('dekzametazon'),
      [...onadronSpellings],
    )

    if (errors.length) {
      throw new Error(`Clinical DB doğrulaması başarısız (${errors.length}):\n- ${errors.join('\n- ')}`)
    }
    console.log('Clinical DB doğrulaması başarıyla tamamlandı.')
  } finally {
    await db.$client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
