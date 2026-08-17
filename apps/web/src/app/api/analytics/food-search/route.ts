import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@ogun/db'
import { logFoodSearchQuery } from '@ogun/db/queries'
import { requireClinic, UnauthenticatedError, NoActiveClinicError } from '@/lib/authz'
import { normalizeSearchText } from '@/lib/normalize'
import { withRequestLogging } from '@/lib/monitoring/logger'

// GitHub issue #47 / Prompt 8.3, GÖREV 4 — "arama sonucu bulunamayan
// sorgular... hangi Türk yemeklerinin veri tabanında eksik olduğunu bize
// söyleyecek". Bu route lib/food-index.ts'teki searchFoodsOffline'ın (Dexie/
// Orama, TAMAMEN istemci tarafında çalışan besin araması, bkz. o dosyanın
// başındaki not) HER aramasından sonra (sonuç sayısı ne olursa olsun, hem
// "en çok aranan" hem "sıfır sonuçlu" metriği İÇİN) çağrılır — arama
// sorgusu bir besin ADI arama metnidir, danışan sağlık verisi DEĞİLDİR (bkz.
// schema/analytics.ts foodSearchLogs üstündeki not).
const bodySchema = z.object({
  query: z.string().trim().min(1).max(200),
  resultCount: z.number().int().min(0),
})

async function handlePost(request: NextRequest): Promise<Response> {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövdesi.' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const ctx = await requireClinic()
    await logFoodSearchQuery(db, {
      clinicId: ctx.scope.clinicId,
      query: parsed.data.query,
      normalizedQuery: normalizeSearchText(parsed.data.query),
      resultCount: parsed.data.resultCount,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    // Aktif bir klinik yoksa (ör. oturum kurulum aşamasındaysa) sessizce
    // yut — arama günlüğü, arama ÖZELLİĞİNİN kendisini ASLA engellememeli.
    if (error instanceof UnauthenticatedError || error instanceof NoActiveClinicError) {
      return NextResponse.json({ ok: true })
    }
    throw error
  }
}

export const POST = withRequestLogging('analytics.food-search', handlePost)
