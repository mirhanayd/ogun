import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { db } from '@ogun/db'
import { listClinicDietitians } from '@ogun/db/queries'
import type { ClientStatus } from '@ogun/db/schema'
import { Button } from '@/components/ui/button'
import { requireClinic } from '@/lib/authz'
import { STATUS_OPTIONS } from '@/lib/validation/client-schemas'
import { ClientsTable } from './clients-table'
import { listClientsForClinic } from './queries'

const PAGE_SIZE = 20

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseStatus(value: string | undefined): ClientStatus | undefined {
  return STATUS_OPTIONS.some((option) => option.value === value) ? (value as ClientStatus) : undefined
}

// Danışan listesi (GitHub issue #17 / Prompt 4.1, GÖREV 2). Sayfalama/arama/
// filtre durumu BİLEREK istemci state'inde DEĞİL, URL query string'inde
// (?q=&status=&dietitian=&page=) tutuluyor — bu, "sunucu tarafı sayfalama"
// isteğinin doğal sonucu: her filtre değişimi yeni bir sunucu render'ı
// tetikler (bkz. clients-table.tsx navigate()), sayfa yenilendiğinde/
// paylaşıldığında filtre durumu kaybolmaz.
export default async function DanisanlarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const page = Math.max(Number(readParam(params.page)) || 1, 1)
  const search = readParam(params.q)
  const status = parseStatus(readParam(params.status))
  const assignedDietitianId = readParam(params.dietitian)

  const { scope, role } = await requireClinic()

  const [result, dietitians] = await Promise.all([
    listClientsForClinic({ page, pageSize: PAGE_SIZE, search, status, assignedDietitianId }),
    listClinicDietitians(db, scope.clinicId),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Danışanlar</h1>
          <p className="text-sm text-muted-foreground">Kliniğinizdeki tüm danışanlar.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/danisanlar/yeni">
            <UserPlus />
            Yeni danışan
          </Link>
        </Button>
      </div>
      <ClientsTable
        result={result}
        dietitians={dietitians}
        role={role}
        filters={{
          search: search ?? '',
          status: status ?? '',
          assignedDietitianId: assignedDietitianId ?? '',
        }}
      />
    </div>
  )
}
