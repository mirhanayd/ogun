'use client'

import React, { useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Search, Filter, X, SlidersHorizontal, RefreshCw } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface QueueFiltersProps {
  currentFilters: {
    search?: string
    priority?: string
    status?: string
    requiredCapability?: string
    confidence?: string
    attribution?: string
  }
}

export function QueueFilters({ currentFilters }: QueueFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [search, setSearch] = useState(currentFilters.search ?? '')
  const [priority, setPriority] = useState(currentFilters.priority ?? 'all')
  const [status, setStatus] = useState(currentFilters.status ?? 'all')
  const [capability, setCapability] = useState(currentFilters.requiredCapability ?? 'all')
  const [confidence, setConfidence] = useState(currentFilters.confidence ?? 'all')
  const [attribution, setAttribution] = useState(currentFilters.attribution ?? 'all')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const applyFilters = (overrides: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams(searchParams.toString())

    const nextValues = {
      search: search.trim() || undefined,
      priority: priority !== 'all' ? priority : undefined,
      status: status !== 'all' ? status : undefined,
      requiredCapability: capability !== 'all' ? capability : undefined,
      confidence: confidence !== 'all' ? confidence : undefined,
      attribution: attribution !== 'all' ? attribution : undefined,
      ...overrides,
    }

    Object.entries(nextValues).forEach(([key, val]) => {
      if (val) {
        params.set(key, val)
      } else {
        params.delete(key)
      }
    })

    // Reset pagination to first page when filtering
    params.delete('offset')

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters({ search: search.trim() || undefined })
  }

  const resetFilters = () => {
    setSearch('')
    setPriority('all')
    setStatus('all')
    setCapability('all')
    setConfidence('all')
    setAttribution('all')
    setDrawerOpen(false)

    startTransition(() => {
      router.push(pathname)
    })
  }

  const hasActiveFilters = Boolean(
    currentFilters.search ||
      (currentFilters.priority && currentFilters.priority !== 'all') ||
      (currentFilters.status && currentFilters.status !== 'all') ||
      (currentFilters.requiredCapability && currentFilters.requiredCapability !== 'all') ||
      (currentFilters.confidence && currentFilters.confidence !== 'all') ||
      (currentFilters.attribution && currentFilters.attribution !== 'all'),
  )

  return (
    <div className="space-y-3">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        {/* Search Bar Form */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="İlaç adı, hedef (ör. tyramine), veya aday ID ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-20 h-10 w-full"
          />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={isPending}
            className="absolute right-1 text-xs h-8 px-2.5 text-muted-foreground hover:text-foreground"
          >
            {isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Ara'}
          </Button>
        </form>

        {/* Desktop Quick Selectors */}
        <div className="hidden lg:flex items-center gap-2">
          {/* Priority Select */}
          <Select
            value={priority}
            onValueChange={(val) => {
              setPriority(val)
              applyFilters({ priority: val !== 'all' ? val : undefined })
            }}
          >
            <SelectTrigger className="h-10 w-[120px] text-xs">
              <SelectValue placeholder="Öncelik" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Öncelikler</SelectItem>
              <SelectItem value="P1">P1 (Kritik)</SelectItem>
              <SelectItem value="P2">P2 (Yüksek)</SelectItem>
              <SelectItem value="P3">P3 (Orta)</SelectItem>
              <SelectItem value="P4">P4 (Düşük)</SelectItem>
              <SelectItem value="P5">P5 (En Düşük)</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Select */}
          <Select
            value={status}
            onValueChange={(val) => {
              setStatus(val)
              applyFilters({ status: val !== 'all' ? val : undefined })
            }}
          >
            <SelectTrigger className="h-10 w-[150px] text-xs">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="pending">İnceleme Bekleyen</SelectItem>
              <SelectItem value="assigned">Atandı</SelectItem>
              <SelectItem value="in_review">İncelemede</SelectItem>
              <SelectItem value="needs_more_evidence">Kanıt Bekleyen</SelectItem>
              <SelectItem value="approved">Onaylandı</SelectItem>
              <SelectItem value="rejected">Reddedildi</SelectItem>
              <SelectItem value="deferred">Ertelendi</SelectItem>
              <SelectItem value="ready_to_publish">Yayınlamaya Hazır</SelectItem>
              <SelectItem value="published">Yayınlandı</SelectItem>
              <SelectItem value="source_changed">Kaynak Değişti</SelectItem>
            </SelectContent>
          </Select>

          {/* Capability Select */}
          <Select
            value={capability}
            onValueChange={(val) => {
              setCapability(val)
              applyFilters({ requiredCapability: val !== 'all' ? val : undefined })
            }}
          >
            <SelectTrigger className="h-10 w-[160px] text-xs">
              <SelectValue placeholder="Uzmanlık Alanı" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Uzmanlıklar</SelectItem>
              <SelectItem value="medication_food">İlaç - Besin</SelectItem>
              <SelectItem value="medication_supplement">İlaç - Takviye</SelectItem>
              <SelectItem value="medication_timing">İlaç - Zamanlama</SelectItem>
              <SelectItem value="condition_nutrient">Durum - Besin Öğesi</SelectItem>
              <SelectItem value="condition_food">Durum - Besin</SelectItem>
              <SelectItem value="oncology_medication">Onkoloji İlaçları</SelectItem>
              <SelectItem value="renal_nutrition">Renal Beslenme</SelectItem>
              <SelectItem value="general_clinical">Genel Klinik</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mobile Filter Drawer Button / Detailed Filter Trigger */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-10 gap-2 shrink-0 text-xs sm:text-sm">
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filtreler</span>
              {hasActiveFilters && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  Aktif
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Aday Filtreleri</SheetTitle>
              <SheetDescription>
                Klinik inceleme havuzunu uzmanlık, öncelik ve kanıt parametrelerine göre daraltın.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 py-6">
              {/* Priority */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Öncelik (Priority)</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Öncelik seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Öncelikler (P1 - P5)</SelectItem>
                    <SelectItem value="P1">P1 - En Yüksek (Doğrudan SPL)</SelectItem>
                    <SelectItem value="P2">P2 - Yüksek (Güçlü Kanıt)</SelectItem>
                    <SelectItem value="P3">P3 - Orta (Genişletilmiş)</SelectItem>
                    <SelectItem value="P4">P4 - Düşük</SelectItem>
                    <SelectItem value="P5">P5 - En Düşük</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">İnceleme Durumu</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Durum seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    <SelectItem value="pending">İnceleme Bekleyen</SelectItem>
                    <SelectItem value="assigned">Atandı</SelectItem>
                    <SelectItem value="in_review">İncelemede</SelectItem>
                    <SelectItem value="needs_more_evidence">Daha Fazla Kanıt Gerekli</SelectItem>
                    <SelectItem value="approved">Onaylandı</SelectItem>
                    <SelectItem value="rejected">Reddedildi</SelectItem>
                    <SelectItem value="deferred">Ertelendi</SelectItem>
                    <SelectItem value="ready_to_publish">Yayınlamaya Hazır</SelectItem>
                    <SelectItem value="published">Yayınlandı</SelectItem>
                    <SelectItem value="source_changed">Kaynak Değişti</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Required Capability */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Gerekli Uzmanlık / Yetkinlik</label>
                <Select value={capability} onValueChange={setCapability}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Yetkinlik seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Uzmanlıklar</SelectItem>
                    <SelectItem value="medication_food">İlaç - Besin (Eczacı / Hekim)</SelectItem>
                    <SelectItem value="medication_supplement">İlaç - Takviye (Eczacı / Hekim)</SelectItem>
                    <SelectItem value="medication_timing">İlaç - Zamanlama (Eczacı / Hekim)</SelectItem>
                    <SelectItem value="condition_nutrient">Durum - Besin Öğesi (Diyetisyen / Hekim)</SelectItem>
                    <SelectItem value="condition_food">Durum - Besin (Diyetisyen / Hekim)</SelectItem>
                    <SelectItem value="oncology_medication">Onkoloji İlaçları</SelectItem>
                    <SelectItem value="renal_nutrition">Renal Beslenme</SelectItem>
                    <SelectItem value="general_clinical">Genel Klinik</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Extraction Confidence */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Çıkarım Güvenilirliği (Extraction Confidence)</label>
                <Select value={confidence} onValueChange={setConfidence}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Güvenilirlik seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    <SelectItem value="high">Yüksek (High Extraction Confidence)</SelectItem>
                    <SelectItem value="medium">Orta (Medium)</SelectItem>
                    <SelectItem value="low">Düşük (Low)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Attribution Risk */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Etken Madde Atıfı (Attribution)</label>
                <Select value={attribution} onValueChange={setAttribution}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Atıf durumu seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    <SelectItem value="direct_single_ingredient">Tek Etken Madde (Direct Single)</SelectItem>
                    <SelectItem value="multi_ingredient_unattributed">Çoklu Etken Madde (Risk - Çift Hakem)</SelectItem>
                    <SelectItem value="secondary_match_uncertain">İkincil Eşleşme (Belirsiz)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1"
                onClick={resetFilters}
              >
                Temizle
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => {
                  setDrawerOpen(false)
                  applyFilters()
                }}
              >
                Uygula
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="text-xs text-muted-foreground hover:text-foreground h-10 px-2.5"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            Temizle
          </Button>
        )}
      </div>

      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-muted-foreground">Aktif filtreler:</span>
          {currentFilters.search && (
            <Badge variant="outline" className="gap-1 py-0.5">
              Arama: {currentFilters.search}
              <X
                className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
                onClick={() => {
                  setSearch('')
                  applyFilters({ search: undefined })
                }}
              />
            </Badge>
          )}
          {currentFilters.priority && (
            <Badge variant="outline" className="gap-1 py-0.5">
              Öncelik: {currentFilters.priority}
              <X
                className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
                onClick={() => {
                  setPriority('all')
                  applyFilters({ priority: undefined })
                }}
              />
            </Badge>
          )}
          {currentFilters.status && (
            <Badge variant="outline" className="gap-1 py-0.5">
              Durum: {currentFilters.status}
              <X
                className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
                onClick={() => {
                  setStatus('all')
                  applyFilters({ status: undefined })
                }}
              />
            </Badge>
          )}
          {currentFilters.requiredCapability && (
            <Badge variant="outline" className="gap-1 py-0.5">
              Uzmanlık: {currentFilters.requiredCapability}
              <X
                className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100"
                onClick={() => {
                  setCapability('all')
                  applyFilters({ requiredCapability: undefined })
                }}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
