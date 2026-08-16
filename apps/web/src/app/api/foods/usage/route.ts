import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@ogun/db'
import { getFoodSummaries, getPinnedFoodUsage, recordFoodUsage } from '@ogun/db/queries'
import { NoActiveClinicError, UnauthenticatedError, requireClinic } from '@/lib/authz'

// GitHub issue #24 / Prompt 5.2 GÖREV 1 — klinik bazlı "son kullanılanlar /
// sık kullanılanlar" pinlemesi. api/foods/search ve api/foods/index'in
// AKSİNE (bkz. o iki route'un dosya başı notları) bu uç NOKTASI klinik verisi
// döndürür/yazar — bu yüzden requireClinic() ile korunuyor; diğer ikisi
// katalog geneli (tenant'sız) veri sundukları için korunmuyordu.
//
// GET  → FoodSearchInput'un boş sorguda gösterdiği pinlenmiş liste.
// POST → bir besin seçildiğinde/plana eklendiğinde kullanım sayacını artırır.

function mapAuthError(error: unknown): NextResponse | null {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
  if (error instanceof NoActiveClinicError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  return null
}

export interface FoodUsageDto {
  id: string
  nameTr: string
  groupNameTr: string | null
  defaultPortion: { label: string; grams: number } | null
  kcalPer100g: number | null
  // GitHub issue #25 — bkz. getFoodSummaries üstündeki not (food-search.ts):
  // plan editörünün öğün toplamı rozetleri için pinlenmiş listede de makro
  // değerleri gerekiyor.
  proteinPer100g: number | null
  carbPer100g: number | null
  fatPer100g: number | null
  useCount: number
  lastUsedAt: string
}

export async function GET() {
  let clinicId: string
  try {
    clinicId = (await requireClinic()).scope.clinicId
  } catch (error) {
    return mapAuthError(error) ?? NextResponse.json({ error: 'Beklenmeyen hata.' }, { status: 500 })
  }

  const pinned = await getPinnedFoodUsage(db, clinicId)
  const summaries = await getFoodSummaries(
    db,
    pinned.map((row) => row.foodId),
  )

  const dto: FoodUsageDto[] = pinned.map((row) => ({
    id: row.foodId,
    nameTr: row.nameTr,
    groupNameTr: row.groupNameTr,
    defaultPortion: summaries.get(row.foodId)?.defaultPortion ?? null,
    kcalPer100g: summaries.get(row.foodId)?.kcalPer100g ?? null,
    proteinPer100g: summaries.get(row.foodId)?.proteinPer100g ?? null,
    carbPer100g: summaries.get(row.foodId)?.carbPer100g ?? null,
    fatPer100g: summaries.get(row.foodId)?.fatPer100g ?? null,
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt.toISOString(),
  }))

  return NextResponse.json(dto)
}

const recordUsageSchema = z.object({ foodId: z.string().min(1) })

export async function POST(request: NextRequest) {
  let clinicId: string
  try {
    clinicId = (await requireClinic()).scope.clinicId
  } catch (error) {
    return mapAuthError(error) ?? NextResponse.json({ error: 'Beklenmeyen hata.' }, { status: 500 })
  }

  const body: unknown = await request.json().catch(() => null)
  const parsed = recordUsageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await recordFoodUsage(db, clinicId, parsed.data.foodId)
  return NextResponse.json({ success: true })
}
