import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@ogun/db'
import { listSavedMeals } from '@ogun/db/queries'
import type { PlanMealType } from '@ogun/db/schema'
import { NoActiveClinicError, UnauthenticatedError, requireClinic } from '@/lib/authz'
import { withRequestLogging } from '@/lib/monitoring/logger'

// GitHub issue #27 / Prompt 5.5, GÖREV 3 — food-search-input.tsx'teki "@"
// tetikleyicisinin istemci tarafında bir kez çektiği, klinik bazlı kayıtlı
// öğün listesi. apps/foods/usage/route.ts ile AYNI gerekçe: bu uç nokta
// klinik verisi döndürür, requireClinic() ile korunur (katalog geneli
// api/foods/search/index'in AKSİNE).
export interface SavedMealDto {
  id: string
  name: string
  mealType: PlanMealType
  notes: string | null
  itemCount: number
}

function mapAuthError(error: unknown): NextResponse | null {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }
  if (error instanceof NoActiveClinicError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  return null
}

async function handleGet(request: NextRequest): Promise<Response> {
  let clinicId: string
  try {
    clinicId = (await requireClinic()).scope.clinicId
  } catch (error) {
    return mapAuthError(error) ?? NextResponse.json({ error: 'Beklenmeyen hata.' }, { status: 500 })
  }

  const mealType = request.nextUrl.searchParams.get('mealType') as PlanMealType | null
  const rows = await listSavedMeals(db, clinicId, mealType ?? undefined)

  const dto: SavedMealDto[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    mealType: row.mealType,
    notes: row.notes,
    itemCount: row.itemCount,
  }))

  return NextResponse.json(dto)
}

export const GET = withRequestLogging('saved-meals', handleGet)
