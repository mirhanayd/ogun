'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { ClinicMemberRole } from '@ogun/db/schema'
import { Badge } from '@/components/ui/badge'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { initFoodIndex, searchFoodsOffline, type FoodSearchHit } from '@/lib/food-index'
import { useActiveMealStore } from '@/lib/stores/active-meal-store'
import { searchClientsAction, type ClientPickerOption } from '@/app/(app)/randevular/actions'
import { visibleNavItems } from './nav-items'

export interface CommandPaletteItem {
  id: string
  label: string
  icon: LucideIcon
  onSelect?: () => void
  // Şema/modül henüz hazır değilse (bkz. buildClientStubGroup) true —
  // tıklanamaz, yanında "Yakında" rozeti gösterilir.
  disabled?: boolean
}

export interface CommandPaletteGroup {
  heading: string
  items: CommandPaletteItem[]
}

// "Sayfaya git" — gerçek, çalışan navigasyon. Rol filtrelemesi sidebar/bottom
// nav ile aynı visibleNavItems() fonksiyonunu kullanır, iki yerde ayrı ayrı
// tanımlanmaz.
function buildNavigationGroup(
  role: ClinicMemberRole,
  navigate: (href: string) => void,
): CommandPaletteGroup {
  return {
    heading: 'Sayfaya git',
    items: visibleNavItems(role).map((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      icon: item.icon,
      onSelect: () => navigate(item.href),
    })),
  }
}

// GitHub issue #39 / Prompt 7.1 GÜNCELLEMESİ: "Danışan ara" artık GERÇEK bir
// arama — GitHub issue #25'in bıraktığı "yakında" stub'ı burada kapanıyor.
// buildFoodSearchGroup'taki AYNI desen (ZATEN filtrelenmiş bir `hits`
// listesini gösteren bir grup): arama mantığı burada TEKRARLANMIYOR,
// randevu modülünün searchClientsAction'ı (app/(app)/randevular/actions.ts)
// AYNEN çağrılıyor — o da clients.ts'teki listClients arama filtresini sarar.
function buildClientSearchGroup(
  hits: ClientPickerOption[],
  onSelectClient: (client: ClientPickerOption) => void,
): CommandPaletteGroup {
  return {
    heading: 'Danışanlar',
    items: hits.map((client) => ({
      id: `client-${client.id}`,
      label: `${client.firstName} ${client.lastName}`,
      icon: Search,
      onSelect: () => onSelectClient(client),
    })),
  }
}

function buildClientCommandGroup(navigate: (href: string) => void): CommandPaletteGroup {
  return {
    heading: 'Danışanlar',
    items: [
      {
        id: 'client-create',
        label: 'Yeni danışan',
        icon: UserPlus,
        onSelect: () => navigate('/danisanlar/yeni'),
      },
    ],
  }
}

// GitHub issue #24 / Prompt 5.2 GÖREV 3 — issue #11'in bıraktığı genişletme
// notu tam olarak burada gerçekleşiyor.
//
// GitHub issue #25 GÜNCELLEMESİ: "plan editöründeyken ⌘K → besin arama
// moduna girsin, seçilince aktif öğüne eklensin" davranışı artık ÇALIŞIYOR
// — bkz. lib/stores/active-meal-store.ts. Bu grup HÂLÂ bağlamsız (her
// sayfada aynı şekilde) çalışır: yazılan sorgu != '' olduğunda
// lib/food-index.ts'teki offline indeksten (Hafta 1) anlık sonuç gösterir.
// Seçim yapıldığında (bkz. CommandPalette bileşenindeki onSelectFood):
//   - plan editöründe bir öğün odaktaysa (useActiveMealStore.activeMealId)
//     → GERÇEK addItemAction çağrısı (handler üzerinden) çalışır,
//   - aktif öğün yoksa (kullanıcı başka bir sayfadaysa) → eski toast
//     yer tutucusuna düşülür (aşağıdaki fallback).
//
// DİĞER build*Group()'lardan FARKI: onlar `role`/`navigate` gibi durağan
// girdilerle SABİT bir liste üretir (cmdk kendi iç fuzzy filtresiyle
// daraltır) — burası ise ZATEN filtrelenmiş (Orama'dan gelen) bir sonuç
// listesini `hits` parametresiyle alır, çünkü 10.000+ besini tek seferde
// CommandItem olarak render etmek (cmdk'nın kendi filtresine güvenmek)
// hem performans hem doğruluk açısından yanlış olurdu.
function buildFoodSearchGroup(
  hits: FoodSearchHit[],
  onSelectFood: (hit: FoodSearchHit) => void,
): CommandPaletteGroup {
  return {
    heading: 'Besin ara',
    items: hits.map((hit) => ({
      id: `food-${hit.id}`,
      label:
        hit.kcalPer100g !== null
          ? `${hit.nameTr} — ${hit.kcalPer100g.toFixed(0)} kcal/100g`
          : hit.nameTr,
      icon: UtensilsCrossed,
      onSelect: () => onSelectFood(hit),
    })),
  }
}

// GENİŞLETME NOKTASI: yeni bir komut grubu eklemek, `build*Group()` biçiminde
// bir fonksiyon yazıp aşağıdaki diziye eklemekten ibaret — mevcut gruplar
// yeniden yapılandırılmaz.
function useCommandPaletteGroups(
  role: ClinicMemberRole,
  navigate: (href: string) => void,
  foodHits: FoodSearchHit[],
  foodQuery: string,
  onSelectFood: (hit: FoodSearchHit) => void,
  clientHits: ClientPickerOption[],
  onSelectClient: (client: ClientPickerOption) => void,
): CommandPaletteGroup[] {
  return useMemo(() => {
    const groups = [buildNavigationGroup(role, navigate)]
    // Sorgu boşken (henüz bir şey yazılmadıysa) arama sonucu grupları hiç
    // eklenmez — boş bir "Danışanlar"/"Besin ara" başlığı göstermek kafa
    // karıştırır, CommandEmpty diğer gruplar için normal çalışmaya devam eder.
    if (foodQuery.trim() !== '') {
      groups.push(buildClientSearchGroup(clientHits, onSelectClient))
      groups.push(buildFoodSearchGroup(foodHits, onSelectFood))
    } else {
      groups.push(buildClientCommandGroup(navigate))
    }
    return groups
  }, [role, navigate, foodHits, foodQuery, onSelectFood, clientHits, onSelectClient])
}

export function CommandPalette({ role }: { role: ClinicMemberRole }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [foodIndexReady, setFoodIndexReady] = useState(false)
  const [foodQuery, setFoodQuery] = useState('')
  const [foodHits, setFoodHits] = useState<FoodSearchHit[]>([])
  const [clientHits, setClientHits] = useState<ClientPickerOption[]>([])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Besin indeksi (Dexie+Orama) SADECE palet ilk açıldığında yüklenir — her
  // sayfada baştan indirmek yerine "ilk lazım olduğunda" tembel yükleme.
  useEffect(() => {
    if (!open || foodIndexReady) return
    initFoodIndex()
      .then(() => setFoodIndexReady(true))
      .catch((error: unknown) =>
        console.error('[CommandPalette] besin indeksi yüklenemedi:', error),
      )
  }, [open, foodIndexReady])

  useEffect(() => {
    if (!foodIndexReady || foodQuery.trim() === '') {
      setFoodHits([])
      return
    }
    let cancelled = false
    searchFoodsOffline(foodQuery, 8).then((result) => {
      if (!cancelled) setFoodHits(result.hits)
    })
    return () => {
      cancelled = true
    }
  }, [foodQuery, foodIndexReady])

  // Danışan araması — food-index'ten FARKLI olarak sunucuya gidiyor (offline
  // indeks yok, klinik başına yüz/bin mertebesindeki danışan verisi zaten
  // basit bir ILIKE'a yetiyor, bkz. listClients üstündeki not). foodQuery
  // AYNI giriş kutusunu besliyor — tek bir arama kutusu hem besin hem danışan
  // aramasını (bağlama göre farklı gruplar altında) sonuçlandırır.
  useEffect(() => {
    if (foodQuery.trim() === '') {
      setClientHits([])
      return
    }
    let cancelled = false
    const timeout = setTimeout(() => {
      searchClientsAction(foodQuery).then((hits) => {
        if (!cancelled) setClientHits(hits)
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [foodQuery])

  // Palet kapanınca sorgu sıfırlanır — bir sonraki açılışta önceki besin
  // aramasının kalıntısı görünmesin diye.
  useEffect(() => {
    if (!open) setFoodQuery('')
  }, [open])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  const addFoodToActiveMeal = useActiveMealStore((state) => state.addFoodToActiveMeal)
  const activeMealLabel = useActiveMealStore((state) => state.activeMealLabel)

  // bkz. dosya başı notu: plan editöründe bir öğün aktifse GERÇEK ekleme,
  // değilse eski toast yer tutucusu (ör. danışan listesindeyken ⌘K ile
  // besin aratmak hâlâ mümkün olsun, ama hiçbir yere "eklenmiş" gibi
  // yanıltmasın).
  const onSelectFood = useCallback(
    (hit: FoodSearchHit) => {
      setOpen(false)
      const added = addFoodToActiveMeal(hit)
      if (added) {
        toast.success(`${hit.nameTr} eklendi`, {
          description: activeMealLabel ? `${activeMealLabel} öğününe eklendi.` : undefined,
        })
        return
      }
      toast.info(`${hit.nameTr} seçildi`, {
        description: 'Bir öğüne eklemek için plan editöründeyken arayın.',
      })
    },
    [addFoodToActiveMeal, activeMealLabel],
  )

  const onSelectClient = useCallback(
    (client: ClientPickerOption) => {
      setOpen(false)
      router.push(`/danisanlar/${client.id}`)
    },
    [router],
  )

  const groups = useCommandPaletteGroups(
    role,
    navigate,
    foodHits,
    foodQuery,
    onSelectFood,
    clientHits,
    onSelectClient,
  )

  return (
    <>
      {/* Üst bardaki "arama" girişi — GitHub issue #11'in istediği "stub input"
          değil, doğrudan komut paletini açan gerçek bir tetikleyici. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2.5 rounded-xl border border-input/80 bg-muted/45 px-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:border-primary/25 hover:bg-muted/75 dark:bg-input/25"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Ara…</span>
        <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground sm:inline">
          Ctrl K
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Komut paleti"
        description="Sayfalar ve eylemler arasında hızlıca gezinin."
      >
        <CommandInput
          placeholder="Bir komut yazın veya besin arayın…"
          value={foodQuery}
          onValueChange={setFoodQuery}
        />
        <CommandList>
          <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
          {groups.map((group, index) => (
            <div key={group.heading}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    disabled={item.disabled}
                    onSelect={() => item.onSelect?.()}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                    {item.disabled && <Badge variant="secondary">Yakında</Badge>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
