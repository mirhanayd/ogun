import { ClipboardList } from 'lucide-react'
import { db } from '@ogun/db'
import { listClinicDietitians } from '@ogun/db/queries'
import type { ClientStatus } from '@ogun/db/schema'
import { EmptyState } from '@/components/empty-state'
import { ClientsActionsView, ClientsScreen } from '@/screens/clients-screen'
import { requireClinic } from '@/lib/authz'
import { STATUS_OPTIONS } from '@/lib/validation/client-schemas'
import { ClientsTable } from './clients-table'
import { listClientsForClinic } from './queries'
import { CreateSamplePlanButton } from './create-sample-plan-button'

const PAGE_SIZE = 20

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseStatus(value: string | undefined): ClientStatus | undefined {
  return STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as ClientStatus)
    : undefined
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
  const requestedDietitianId = readParam(params.dietitian)

  const { scope, role } = await requireClinic()
  const assignedDietitianId = role === 'owner' ? requestedDietitianId : undefined

  const [result, dietitians] = await Promise.all([
    listClientsForClinic({ page, pageSize: PAGE_SIZE, search, status, assignedDietitianId }),
    role === 'owner' ? listClinicDietitians(db, scope.clinicId) : Promise.resolve([]),
  ])

  return (
    <ClientsScreen
      role={role}
      actions={<ClientsActionsView />}
    >
      {/* GitHub issue #47 / Prompt 8.3, GÖREV 1 — klinikte HİÇ danışan yoksa
          (herhangi bir filtre uygulanmamışken) EmptyState + "örnek danışan ve
          plan oluştur" kısayolu (bkz. create-sample-plan-button.tsx). Bir
          filtre/arama sonucu boşsa (search/status/assignedDietitianId
          doluyken) bu YANLIŞ bir mesaj olurdu — o durumda ClientsTable zaten
          boş bir tabloyu kendi başına gösterir. */}
      {result.rows.length === 0 && !search && !status && !assignedDietitianId ? (
        <EmptyState
          icon={ClipboardList}
          title="Henüz danışan yok"
          description="İlk danışanınızı ekleyerek başlayın, ya da uygulamayı denemek için örnek bir danışan ve plan oluşturun."
        >
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <CreateSamplePlanButton />
          </div>
        </EmptyState>
      ) : (
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
      )}
    </ClientsScreen>
  )
}
