import { NextResponse, type NextRequest } from 'next/server'
import { NoActiveClinicError, UnauthenticatedError } from '@/lib/authz'
import { listClientsForClinic } from '@/app/(app)/danisanlar/queries'
import { withRequestLogging } from '@/lib/monitoring/logger'

// GitHub issue #27 / Prompt 5.5, GÖREV 1 — "Bu şablondan plan oluştur →
// danışan seç → düzenlemeye git" akışının danışan seçici diyaloğu (bkz.
// apps/web/src/app/(app)/planlar/sablonlar/client-picker-dialog.tsx) bu
// uç noktadan hafif bir DTO listesi çeker. BİLEREK doğrudan @ogun/db/queries
// listClients'i ÇAĞIRMIYOR — danisanlar/queries.ts'teki listClientsForClinic
// zaten withAuth(withAudit(...)) ile sarılı (bkz. o dosyanın dosya başı
// notu); sağlık/danışan verisine dokunan HER sorgu bu sarmalayıcıdan geçmeli
// kuralı, burada onu YENİDEN yazmak yerine MEVCUT sarmalı fonksiyonu
// çağırarak korunuyor.
export interface ClientSearchDto {
  id: string
  firstName: string
  lastName: string
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
  const search = request.nextUrl.searchParams.get('q') ?? undefined

  try {
    const result = await listClientsForClinic({ search, pageSize: 20 })
    const dto: ClientSearchDto[] = result.rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
    }))
    return NextResponse.json(dto)
  } catch (error) {
    return mapAuthError(error) ?? NextResponse.json({ error: 'Beklenmeyen hata.' }, { status: 500 })
  }
}

export const GET = withRequestLogging('clients.search', handleGet)
