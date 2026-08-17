import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@ogun/db'
import { getFoodSummaries, searchFoods } from '@ogun/db/queries'
import { withRequestLogging } from '@/lib/monitoring/logger'

const searchParamsSchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  group: z.string().optional(),
})

export interface FoodSearchDto {
  id: string
  nameTr: string
  groupNameTr: string | null
  defaultPortion: { label: string; grams: number } | null
  kcalPer100g: number | null
}

// GitHub issue #45 / Prompt 8.1 — withRequestLogging ile sarmalandı (bkz.
// lib/monitoring/logger.ts): sorgu metni (q) GÖVDE/param olarak loglanmaz,
// sadece metod/status/süre.
async function handleGet(request: NextRequest): Promise<Response> {
  const parsed = searchParamsSchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    group: request.nextUrl.searchParams.get('group') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { q, limit, group } = parsed.data

  const results = await searchFoods(db, { query: q, limit, groupCode: group })
  const summaries = await getFoodSummaries(
    db,
    results.map((r) => r.id),
  )

  const dto: FoodSearchDto[] = results.map((result) => ({
    id: result.id,
    nameTr: result.nameTr,
    groupNameTr: result.groupNameTr,
    defaultPortion: summaries.get(result.id)?.defaultPortion ?? null,
    kcalPer100g: summaries.get(result.id)?.kcalPer100g ?? null,
  }))

  return NextResponse.json(dto)
}

export const GET = withRequestLogging('foods.search', handleGet)
