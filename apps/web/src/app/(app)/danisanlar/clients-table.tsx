'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { SearchX } from 'lucide-react'
import { toast } from 'sonner'
import { toastActionError } from '@/lib/action-toast'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
} from '@tanstack/react-table'
import type { ClientListRow, ListClientsResult } from '@ogun/db/queries'
import type { ClinicDietitianOption } from '@ogun/db/queries'
import type { ClinicMemberRole, ClientStatus } from '@ogun/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { calculateAge } from '@/lib/client-age'
import { STATUS_LABELS_TR, STATUS_OPTIONS } from '@/lib/validation/client-schemas'
import { archiveClientsAction, assignDietitianAction } from './actions'
import { selectedClientIds, selectionSummaryLabel } from './selection'

export interface ClientsFilters {
  search: string
  status: string
  assignedDietitianId: string
}

// "Durum" rozetinin rengi — aktif olumlu (default), pasif nötr (secondary),
// arşiv daha soluk (outline). Sabit bir sözlük: renk seçimi status
// değerlerinin KENDİSİ kadar önemli değil, sadece tabloda göz atarken hızlı
// bir ayrım sağlasın diye var.
const STATUS_BADGE_VARIANT: Record<ClientStatus, 'default' | 'secondary' | 'outline'> = {
  aktif: 'default',
  pasif: 'secondary',
  arşiv: 'outline',
}

const ALL_FILTER_VALUE = 'all'

function buildQueryString(filters: ClientsFilters, page: number): string {
  const params = new URLSearchParams()
  if (filters.search) params.set('q', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.assignedDietitianId) params.set('dietitian', filters.assignedDietitianId)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function ClientsTable({
  result,
  dietitians,
  role,
  filters,
}: {
  result: ListClientsResult
  dietitians: ClinicDietitianOption[]
  role: ClinicMemberRole
  filters: ClientsFilters
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(filters.search)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignDietitianId, setAssignDietitianId] = useState<string>('')

  // Toplu işlemler (arşivle, diyetisyen ata) sadece owner/dietitian —
  // actions.ts'teki requireRole(['owner','dietitian']) kısıtıyla aynı,
  // burada tekrarlanması bir güvenlik sınırı DEĞİL (nav-items.ts'teki
  // "gizleme tek başına güvenlik sınırı değildir" notuyla aynı gerekçe),
  // sadece assistant'a hiç kullanamayacağı bir seçim arayüzü göstermemek için.
  const canBulkManage = role !== 'assistant'

  const columnHelper = useMemo(() => createColumnHelper<ClientListRow>(), [])

  const columns = useMemo(
    () => [
      ...(canBulkManage
        ? [
            columnHelper.display({
              id: 'select',
              header: ({ table }) => (
                <input
                  type="checkbox"
                  aria-label="Tümünü seç"
                  checked={table.getIsAllRowsSelected()}
                  ref={(el) => {
                    if (el) el.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
                  }}
                  onChange={table.getToggleAllRowsSelectedHandler()}
                />
              ),
              cell: ({ row }) => (
                <input
                  type="checkbox"
                  aria-label="Danışanı seç"
                  checked={row.getIsSelected()}
                  onChange={row.getToggleSelectedHandler()}
                  onClick={(event) => event.stopPropagation()}
                />
              ),
            }),
          ]
        : []),
      columnHelper.display({
        id: 'name',
        header: 'Ad Soyad',
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.firstName} {row.original.lastName}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'age',
        header: 'Yaş',
        cell: ({ row }) => calculateAge(row.original.birthDate) ?? '—',
      }),
      // "Son ölçüm" / "son randevu": measurements (GitHub issue #18 / Prompt
      // 4.2) ve randevu modülü (henüz açılmamış bir issue) tabloları bu
      // repoda henüz YOK — bkz. packages/db/src/queries/clients.ts listClients
      // üstündeki not. Bu iki kolon şimdilik sabit bir yer tutucu gösterir.
      columnHelper.display({
        id: 'lastMeasurement',
        header: 'Son ölçüm',
        cell: () => <span className="text-muted-foreground">Yakında</span>,
      }),
      columnHelper.display({
        id: 'lastAppointment',
        header: 'Son randevu',
        cell: () => <span className="text-muted-foreground">Yakında</span>,
      }),
      columnHelper.accessor('assignedDietitianName', {
        header: 'Atanan diyetisyen',
        cell: ({ getValue }) => getValue() ?? '—',
      }),
      columnHelper.accessor('status', {
        header: 'Durum',
        cell: ({ getValue }) => {
          const status = getValue()
          return <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABELS_TR[status]}</Badge>
        },
      }),
    ],
    [canBulkManage, columnHelper],
  )

  const table = useReactTable({
    data: result.rows,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: canBulkManage,
  })

  function navigate(nextFilters: ClientsFilters, page: number) {
    startTransition(() => {
      router.push(`/danisanlar${buildQueryString(nextFilters, page)}`)
    })
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault()
    navigate({ ...filters, search: searchInput.trim() }, 1)
  }

  function handleStatusChange(value: string) {
    navigate({ ...filters, status: value === ALL_FILTER_VALUE ? '' : value }, 1)
  }

  function handleDietitianFilterChange(value: string) {
    navigate({ ...filters, assignedDietitianId: value === ALL_FILTER_VALUE ? '' : value }, 1)
  }

  const selectedIds = selectedClientIds(rowSelection)

  async function handleArchive() {
    const result = await archiveClientsAction(selectedIds)
    if (!result.success) {
      toastActionError(result.error ?? 'Arşivleme başarısız oldu.', 'Seçimi daraltıp tekrar deneyin; arşivlenmiş danışanlar durum filtresinden geri getirilebilir.')
      return
    }
    toast.success(`${selectedIds.length} danışan arşivlendi.`)
    setRowSelection({})
    router.refresh()
  }

  async function handleAssignConfirm() {
    if (!assignDietitianId) return
    const result = await assignDietitianAction(selectedIds, assignDietitianId)
    if (!result.success) {
      toastActionError(result.error ?? 'Atama başarısız oldu.', 'Diyetisyenin bu klinikte hâlâ üye olduğundan emin olup tekrar deneyin.')
      return
    }
    toast.success(`${selectedIds.length} danışana diyetisyen atandı.`)
    setAssignDialogOpen(false)
    setAssignDietitianId('')
    setRowSelection({})
    router.refresh()
  }

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="flex w-full max-w-sm gap-2">
          <Input
            placeholder="Ad, soyad, telefon veya e-posta ara…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            Ara
          </Button>
        </form>
        <div className="flex gap-2">
          <Select value={filters.status || ALL_FILTER_VALUE} onValueChange={handleStatusChange}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>Tüm durumlar</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.assignedDietitianId || ALL_FILTER_VALUE} onValueChange={handleDietitianFilterChange}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue placeholder="Diyetisyen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>Tüm diyetisyenler</SelectItem>
              {dietitians.map((dietitian) => (
                <SelectItem key={dietitian.id} value={dietitian.id}>
                  {dietitian.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {canBulkManage && selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selectionSummaryLabel(selectedIds.length)}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={handleArchive}>
              Arşivle
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAssignDialogOpen(true)} disabled={dietitians.length === 0}>
              Diyetisyen ata
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                {/* GitHub issue #62 / Prompt 10.4, GÖREV 1 — bu satır bir
                    FİLTRE/ARAMA sonucu boş kaldığında görünür (klinikte hiç
                    danışan yoksa page.tsx zaten tam boyutlu EmptyState
                    gösteriyor). Düz "Kayıt bulunamadı." metni ne olduğunu
                    da ne yapılacağını da söylemiyordu. */}
                <TableCell colSpan={columns.length} className="p-0">
                  <EmptyState
                    variant="inline"
                    icon={SearchX}
                    title="Bu filtrelerle danışan bulunamadı"
                    description="Arama metnini kısaltmayı ya da durum/diyetisyen filtrelerini temizlemeyi deneyin."
                    action={{
                      label: 'Filtreleri temizle',
                      onClick: () => {
                        setSearchInput('')
                        navigate({ search: '', status: '', assignedDietitianId: '' }, 1)
                      },
                    }}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/danisanlar/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Sayfa {result.page} / {totalPages} — toplam {result.total} danışan
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={result.page <= 1 || isPending}
            onClick={() => navigate(filters, result.page - 1)}
          >
            Önceki
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={result.page >= totalPages || isPending}
            onClick={() => navigate(filters, result.page + 1)}
          >
            Sonraki
          </Button>
        </div>
      </div>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diyetisyen ata</DialogTitle>
            <DialogDescription>
              Seçili {selectedIds.length} danışana atanacak diyetisyeni seçin.
            </DialogDescription>
          </DialogHeader>
          <Select value={assignDietitianId} onValueChange={setAssignDietitianId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Diyetisyen seçin" />
            </SelectTrigger>
            <SelectContent>
              {dietitians.map((dietitian) => (
                <SelectItem key={dietitian.id} value={dietitian.id}>
                  {dietitian.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Vazgeç
            </Button>
            <Button onClick={handleAssignConfirm} disabled={!assignDietitianId}>
              Ata
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
