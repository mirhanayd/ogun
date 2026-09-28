'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { NavigationLink as Link } from '@/components/navigation-link'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Search,
  SearchX,
  SlidersHorizontal,
} from 'lucide-react'
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
import type { ClinicMemberRole } from '@ogun/db/schema'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/empty-state'
import { calculateAge } from '@/lib/client-age'
import { STATUS_LABELS_TR } from '@/lib/validation/client-schemas'
import { selectedClientIds, selectionSummaryLabel } from '@/app/(app)/danisanlar/selection'
import { formatLastAppointment, formatLastMeasurement } from '@/lib/client-list-activity'
import { canManuallyAssignDietitian } from '@/lib/dietitian-assignment'

export interface ClientsFilters {
  search: string
  status: string
  assignedDietitianId: string
}

const ALL_FILTER_VALUE = 'all'

export interface ClientAttentionIndicator {
  measurementReason?: string
  packageReason?: string
}

export function ClientsTableView({
  result,
  dietitians,
  role,
  filters,
  onNavigate,
  onArchive,
  onAssign,
  attentionByClient = {},
  renderRowActions,
}: {
  result: ListClientsResult
  dietitians: ClinicDietitianOption[]
  role: ClinicMemberRole
  filters: ClientsFilters
  onNavigate: (filters: ClientsFilters, page: number) => void
  onArchive: (ids: string[]) => Promise<{ success: boolean; error?: string }>
  onAssign: (ids: string[], dietitianId: string) => Promise<{ success: boolean; error?: string }>
  attentionByClient?: Record<string, ClientAttentionIndicator>
  renderRowActions?: (client: ClientListRow) => ReactNode
}) {
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(filters.search)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignDietitianId, setAssignDietitianId] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const hasFilters = Boolean(filters.search || filters.status || filters.assignedDietitianId)
  useEffect(() => {
    setSearchInput(filters.search)
  }, [filters.search])
  useEffect(() => {
    const search = searchInput.trim()
    if (search === filters.search) return
    const timeout = window.setTimeout(() => {
      setRowSelection({})
      startTransition(() => onNavigate({ ...filters, search }, 1))
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [filters, onNavigate, searchInput])

  // Toplu işlemler (arşivle, diyetisyen ata) sadece owner/dietitian —
  // actions.ts'teki requireRole(['owner','dietitian']) kısıtıyla aynı,
  // burada tekrarlanması bir güvenlik sınırı DEĞİL (nav-items.ts'teki
  // "gizleme tek başına güvenlik sınırı değildir" notuyla aynı gerekçe),
  // sadece assistant'a hiç kullanamayacağı bir seçim arayüzü göstermemek için.
  const canBulkManage = role === 'owner' || role === 'dietitian'
  const canAssign = canManuallyAssignDietitian(role)

  const columnHelper = useMemo(() => createColumnHelper<ClientListRow>(), [])

  const columns = useMemo(
    () => [
      ...(canBulkManage
        ? [
            columnHelper.display({
              id: 'select',
              header: ({ table }) => (
                <label className="grid size-10 cursor-pointer place-items-center">
                  <input
                    type="checkbox"
                    aria-label="Tümünü seç"
                    checked={table.getIsAllRowsSelected()}
                    ref={(el) => {
                      if (el)
                        el.indeterminate =
                          table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()
                    }}
                    onChange={table.getToggleAllRowsSelectedHandler()}
                  />
                </label>
              ),
              cell: ({ row }) => (
                <label className="grid size-10 cursor-pointer place-items-center">
                  <input
                    type="checkbox"
                    aria-label={`${row.original.firstName} ${row.original.lastName} adlı danışanı seç`}
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                  />
                </label>
              ),
            }),
          ]
        : []),
      columnHelper.display({
        id: 'name',
        header: 'Ad Soyad',
        cell: ({ row }) => (
          <Link
            href={`/danisanlar/${row.original.id}`}
            className="group/name flex min-w-44 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {row.original.firstName.slice(0, 1)}
              {row.original.lastName.slice(0, 1)}
              {attentionByClient[row.original.id] ? (
                <span
                  className={`absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background ${attentionByClient[row.original.id]?.measurementReason ? 'bg-destructive' : 'bg-amber-500'}`}
                  title={[
                    attentionByClient[row.original.id]?.measurementReason,
                    attentionByClient[row.original.id]?.packageReason,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ) : null}
            </span>
            <span className="font-medium group-hover/name:underline">
              {row.original.firstName} {row.original.lastName}
              {row.original.firstName === 'Örnek' && row.original.lastName === 'Danışan' ? (
                <span className="ml-1 font-normal text-muted-foreground">(örnek)</span>
              ) : null}
            </span>
          </Link>
        ),
      }),
      columnHelper.display({
        id: 'age',
        header: 'Yaş',
        cell: ({ row }) => calculateAge(row.original.birthDate) ?? '—',
      }),
      columnHelper.display({
        id: 'lastMeasurement',
        header: 'Son ölçüm',
        cell: ({ row }) => {
          const current = Number(row.original.lastMeasurementWeightKg)
          const previous = Number(row.original.previousMeasurementWeightKg)
          const hasTrend =
            row.original.lastMeasurementWeightKg !== null &&
            row.original.previousMeasurementWeightKg !== null &&
            Number.isFinite(current) &&
            Number.isFinite(previous) &&
            current !== previous
          const TrendIcon = current > previous ? ArrowUp : ArrowDown
          return (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {formatLastMeasurement(row.original)}
              {hasTrend ? (
                <TrendIcon
                  className="size-3.5 text-muted-foreground"
                  aria-label={current > previous ? 'Kilo arttı' : 'Kilo azaldı'}
                />
              ) : null}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'lastAppointment',
        header: 'Son randevu',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{formatLastAppointment(row.original)}</span>
        ),
      }),
      columnHelper.accessor('assignedDietitianName', {
        header: 'Atanan diyetisyen',
        cell: ({ getValue }) => getValue() ?? '—',
      }),
      columnHelper.accessor('status', {
        header: 'Durum',
        cell: ({ getValue }) => {
          const status = getValue()
          return (
            <span className="inline-flex items-center gap-2 text-sm">
              <span
                className={`size-1.5 rounded-full ${status === 'aktif' ? 'bg-emerald-500' : status === 'arşiv' ? 'bg-destructive' : 'bg-muted-foreground/45'}`}
              />
              {STATUS_LABELS_TR[status]}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          renderRowActions ? (
            <div className="ml-auto opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 group-focus-within/row:opacity-100">
              {renderRowActions(row.original)}
            </div>
          ) : null,
      }),
    ],
    [attentionByClient, canBulkManage, columnHelper, renderRowActions],
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
    setRowSelection({})
    startTransition(() => {
      onNavigate(nextFilters, page)
    })
  }

  function handleStatusChange(value: string) {
    navigate({ ...filters, status: value === ALL_FILTER_VALUE ? '' : value }, 1)
  }

  function handleDietitianFilterChange(value: string) {
    navigate({ ...filters, assignedDietitianId: value === ALL_FILTER_VALUE ? '' : value }, 1)
  }

  const selectedIds = selectedClientIds(rowSelection)

  async function handleArchive() {
    setIsSaving(true)
    let result
    try {
      result = await onArchive(selectedIds)
    } catch {
      result = {
        success: false,
        error: 'Arşivleme tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.',
      }
    } finally {
      setIsSaving(false)
    }
    if (!result.success) {
      toastActionError(
        result.error ?? 'Arşivleme başarısız oldu.',
        'Seçimi daraltıp tekrar deneyin; arşivlenmiş danışanlar durum filtresinden geri getirilebilir.',
      )
      return
    }
    toast.success(`${selectedIds.length} danışan arşivlendi.`)
    setRowSelection({})
  }

  async function handleAssignConfirm() {
    if (!assignDietitianId) return
    setIsSaving(true)
    let result
    try {
      result = await onAssign(selectedIds, assignDietitianId)
    } catch {
      result = {
        success: false,
        error: 'Atama tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.',
      }
    } finally {
      setIsSaving(false)
    }
    if (!result.success) {
      toastActionError(
        result.error ?? 'Atama başarısız oldu.',
        'Diyetisyenin bu klinikte hâlâ üye olduğundan emin olup tekrar deneyin.',
      )
      return
    }
    toast.success(`${selectedIds.length} danışana diyetisyen atandı.`)
    setAssignDialogOpen(false)
    setAssignDietitianId('')
    setRowSelection({})
  }

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1)

  return (
    <div
      className="clients-workspace flex min-w-0 flex-col gap-3"
      aria-busy={isPending || isSaving}
    >
      <div className="flex items-end justify-between gap-6 border-b border-border">
        <div className="flex min-w-0 items-center gap-6" aria-label="Danışan durumu">
          {[
            { value: '', label: 'Tümü' },
            { value: 'aktif', label: 'Aktif' },
            { value: 'arşiv', label: 'Arşiv' },
          ].map((tab) => {
            const active = filters.status === tab.value
            return (
              <button
                key={tab.value || 'all'}
                type="button"
                aria-pressed={active}
                className={`border-b-2 px-0 pb-2 text-sm font-medium transition-colors ${active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                onClick={() => handleStatusChange(tab.value || ALL_FILTER_VALUE)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="flex min-w-0 items-center gap-2 pb-2">
          <div className="relative w-80 max-w-[38vw]">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Danışan ara"
              placeholder="Ad, soyad, telefon veya e-posta ara…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-9 rounded-none border-0 border-b bg-transparent pr-2 pl-8 shadow-none focus-visible:border-primary focus-visible:ring-0"
            />
          </div>
          {role === 'owner' && (
            <Select
              value={filters.assignedDietitianId || ALL_FILTER_VALUE}
              onValueChange={handleDietitianFilterChange}
            >
              <SelectTrigger
                aria-label="Atanan diyetisyen"
                title={
                  dietitians.find((dietitian) => dietitian.id === filters.assignedDietitianId)
                    ?.name ?? 'Diyetisyene göre filtrele'
                }
                className="size-9 border-0 bg-transparent px-0 shadow-none hover:bg-muted focus-visible:ring-2"
              >
                <SlidersHorizontal className="size-4" />
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
          )}
        </div>
      </div>

      <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 px-1 text-sm">
        <p role="status" className="mr-auto text-muted-foreground">
          {isPending ? (
            'Danışanlar yükleniyor…'
          ) : (
            <>
              <strong className="font-semibold tabular-nums text-foreground">{result.total}</strong>{' '}
              {hasFilters ? 'danışan bulundu' : 'danışan'}
              {result.total > 0 ? (
                <span className="ml-2 text-xs">
                  {(result.page - 1) * result.pageSize + 1}–
                  {Math.min(result.page * result.pageSize, result.total)} gösteriliyor
                </span>
              ) : null}
            </>
          )}
        </p>
        {canBulkManage && result.rows.length > 0 ? (
          <label className="flex min-h-10 items-center gap-2 md:hidden">
            <input
              type="checkbox"
              checked={table.getIsAllRowsSelected()}
              onChange={table.getToggleAllRowsSelectedHandler()}
            />
            Sayfadakileri seç
          </label>
        ) : null}
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('')
              navigate({ search: '', status: '', assignedDietitianId: '' }, 1)
            }}
          >
            Filtreleri temizle
          </Button>
        ) : null}
      </div>

      {canBulkManage && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.045] px-4 py-3 text-sm shadow-sm shadow-primary/5">
          <span className="font-medium">{selectionSummaryLabel(selectedIds.length)}</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRowSelection({})}
              disabled={isSaving}
            >
              Seçimi kaldır
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg bg-background/75"
              onClick={handleArchive}
              disabled={isSaving}
            >
              Arşivle
            </Button>
            {canAssign && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg bg-background/75"
                onClick={() => setAssignDialogOpen(true)}
                disabled={isSaving || dietitians.length === 0}
              >
                Diyetisyen ata
              </Button>
            )}
          </div>
        </div>
      )}

      {table.getRowModel().rows.length === 0 ? (
        <div className="rounded-2xl border border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.025]">
          <EmptyState
            variant="inline"
            icon={SearchX}
            title={hasFilters ? 'Bu filtrelerle danışan bulunamadı' : 'Henüz danışan yok'}
            description={
              hasFilters
                ? 'Arama metnini kısaltın veya filtreleri temizleyin.'
                : 'Yeni danışan ekleyerek kayıt, ölçüm ve randevu takibine başlayın.'
            }
            action={
              hasFilters
                ? {
                    label: 'Filtreleri temizle',
                    onClick: () => {
                      setSearchInput('')
                      navigate({ search: '', status: '', assignedDietitianId: '' }, 1)
                    },
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto border-t border-border md:block">
            <Table className="min-w-[880px]">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className="group/row border-b border-border transition-colors last:border-b-0 hover:bg-muted/35"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {table.getRowModel().rows.map((row) => {
              const client = row.original
              const age = calculateAge(client.birthDate)
              return (
                <div
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="rounded-xl border border-border bg-card p-4 data-[state=selected]:border-primary data-[state=selected]:bg-accent/30"
                >
                  <div className="flex items-start gap-3">
                    {canBulkManage && (
                      <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
                        <input
                          type="checkbox"
                          aria-label={`${client.firstName} ${client.lastName} adlı danışanı seç`}
                          checked={row.getIsSelected()}
                          onChange={row.getToggleSelectedHandler()}
                        />
                      </label>
                    )}
                    <Link
                      href={`/danisanlar/${client.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                        {client.firstName.slice(0, 1)}
                        {client.lastName.slice(0, 1)}
                        {attentionByClient[client.id] ? (
                          <span
                            className={`absolute right-0 bottom-0 size-3 rounded-full border-2 border-background ${attentionByClient[client.id]?.measurementReason ? 'bg-destructive' : 'bg-amber-500'}`}
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold group-hover:text-foreground">
                          {client.firstName} {client.lastName}
                        </span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {age === null ? 'Yaş bilgisi yok' : `${age} yaş`}
                          {client.assignedDietitianName ? ` · ${client.assignedDietitianName}` : ''}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground/45 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </Link>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs">
                    <div>
                      <span className="block text-muted-foreground">Son ölçüm</span>
                      <span className="mt-1 block font-medium">
                        {formatLastMeasurement(client)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground">Son randevu</span>
                      <span className="mt-1 block font-medium">
                        {formatLastAppointment(client)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                    <span className="inline-flex items-center gap-2 text-xs">
                      <span
                        className={`size-1.5 rounded-full ${client.status === 'aktif' ? 'bg-emerald-500' : client.status === 'arşiv' ? 'bg-destructive' : 'bg-muted-foreground/45'}`}
                      />
                      {STATUS_LABELS_TR[client.status]}
                    </span>
                    <span className="text-xs text-muted-foreground">Danışan kaydını aç</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1}–
          {Math.min(result.page * result.pageSize, result.total)} / {result.total}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Önceki sayfa"
            className="grid size-8 place-items-center rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
            disabled={result.page <= 1 || isPending}
            onClick={() => navigate(filters, result.page - 1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Sonraki sayfa"
            className="grid size-8 place-items-center rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
            disabled={result.page >= totalPages || isPending}
            onClick={() => navigate(filters, result.page + 1)}
          >
            <ChevronRight className="size-4" />
          </button>
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
            <SelectTrigger aria-label="Atanacak diyetisyen" className="w-full">
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
            <Button onClick={handleAssignConfirm} disabled={isSaving || !assignDietitianId}>
              {isSaving ? 'Atanıyor…' : 'Ata'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
