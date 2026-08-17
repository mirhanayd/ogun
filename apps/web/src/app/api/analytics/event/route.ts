import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { headers } from 'next/headers'
import { db } from '@ogun/db'
import { logUsageEvent } from '@ogun/db/queries'
import { auth } from '@/lib/auth'
import { withRequestLogging } from '@/lib/monitoring/logger'

// GitHub issue #47 / Prompt 8.3, GÖREV 2 — usageEvents'in TEK yazma yolu.
// GÖREV 2'nin "sağlık verisi göndermeyin" kuralı burada İKİ katmanda
// zorlanıyor: (1) apps/web/src/lib/analytics/track.ts'in TrackEventPayload
// tipi zaten serbest bir alan taşımaz (istemci health data GÖNDEREMEZ), (2)
// bu route eventName'i SABİT bir enum'a karşı doğrular (aşağıdaki
// ALLOWED_EVENT_NAMES) — istemci tarafı derlenmiş kodu manipüle edilse bile
// (ör. bir tarayıcı eklentisiyle fetch çağrısı elle tetiklenirse) sunucu
// tanımadığı bir eventName'i REDDEDER, screen bir serbest metin DEĞİL kısa
// bir route etiketi olacak şekilde uzunlukla sınırlanır.
const ALLOWED_EVENT_NAMES = [
  'screen_view',
  'plan_created',
  'sample_plan_created',
  'feedback_submitted',
  'product_tour_completed',
  'product_tour_skipped',
  'client_csv_import_completed',
] as const

const eventSchema = z.object({
  eventName: z.enum(ALLOWED_EVENT_NAMES),
  screen: z.string().trim().max(200).optional(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
})

async function handlePost(request: NextRequest): Promise<Response> {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz JSON gövdesi.' }, { status: 400 })
  }

  const parsed = eventSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // sendBeacon (bkz. lib/analytics/track.ts) oturum çerezlerini GÖNDERİR,
  // bu yüzden normal bir istekle AYNI şekilde oturum okunabilir — ama analitik
  // bir isteğin başarısız olması ASLA uygulamayı kesmemeli, bu yüzden
  // requireAuth() (fırlatan) yerine oturum burada SESSİZCE opsiyonel okunuyor.
  const session = await auth.api.getSession({ headers: await headers() })

  await logUsageEvent(db, {
    clinicId: session?.session.activeClinicId ?? null,
    userId: session?.user.id ?? null,
    eventName: parsed.data.eventName,
    screen: parsed.data.screen ?? null,
    durationMs: parsed.data.durationMs ?? null,
  })

  return NextResponse.json({ ok: true })
}

export const POST = withRequestLogging('analytics.event', handlePost)
