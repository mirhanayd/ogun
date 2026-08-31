'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, UserRound, UtensilsCrossed, type LucideIcon } from 'lucide-react'
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
import type { ClientPickerOption } from '@/app/(app)/randevular/actions'
import { visibleNavItems } from './nav-items'
import { visibleSettingsEntries } from './settings-search'

// PALETİN SATIR MODELİ: artık her satır SADECE bir etiket değil — ikinci
// satırda açıklama ve sağda bir TİP ROZETİ ("Sayfa" / "Bölüm" / "Ayar" /
// "Eylem" / "Danışan" / "Besin") taşıyor. Kullanıcının "bu sonuç bir ayar mı,
// bir özellik mi, yoksa bir danışan mı?" sorusu rozetten okunur; hangi
// grubun altında kaldığına bakmak zorunda kalmaz.
type PaletteBadge = 'Sayfa' | 'Bölüm' | 'Ayar' | 'Eylem' | 'Danışan' | 'Besin'

export interface PaletteItem {
  id: string
  label: string
  /** Etiketin altındaki ikinci satır (varsa). */
  description?: string
  icon: LucideIcon
  badge?: PaletteBadge
  /**
   * cmdk'nın fuzzy filtresinin eşlediği tam metin: etiket + açıklama +
   * anahtar kelimeler. `value` verilmeyen satırlar yalnızca etiketleriyle
   * eşleşirdi; kullanıcı "sms" yazıp "Randevu hatırlatmaları"na ulaşamazdı.
   */
  searchValue: string
  onSelect?: () => void
}

export interface CommandPaletteGroup {
  heading: string
  items: PaletteItem[]
}

// "Sayfaya git" — gerçek, çalışan navigasyon. Rol filtrelemesi sidebar/bottom
// nav ile aynı visibleNavItems() fonksiyonunu kullanır, iki yerde ayrı ayrı
// tanımlanmaz.
function buildNavigationGroup(
  role: ClinicMemberRole,
  navigate: (href: string) => void,
): CommandPaletteGroup {
  return {
    heading: 'Sayfalar',
    items: visibleNavItems(role).map((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      description: NAV_PAGE_DESCRIPTIONS[item.href],
      icon: item.icon,
      badge: 'Sayfa',
      searchValue: `${item.label} ${NAV_PAGE_DESCRIPTIONS[item.href] ?? ''}`,
      onSelect: () => navigate(item.href),
    })),
  }
}

const NAV_PAGE_DESCRIPTIONS: Record<string, string> = {
  '/panel': 'Günlük özet ve hızlı erişim',
  '/danisanlar': 'Danışan listesi ve kayıtları',
  '/randevular': 'Takvim ve randevu yönetimi',
  '/planlar': 'Beslenme planları ve şablonlar',
  '/tarifler': 'Tarif kitaplığı',
  '/finans': 'Gelir-gider takibi',
  '/ayarlar': 'Klinik ayarları ve ekip yönetimi',
}

function buildQuickActionsGroup(navigate: (href: string) => void): CommandPaletteGroup {
  return {
    heading: 'Hızlı eylemler',
    items: [
      {
        id: 'client-create',
        label: 'Yeni danışan',
        icon: UserPlus,
        badge: 'Eylem',
        searchValue: 'yeni danışan ekle oluştur kayıt aç',
        onSelect: () => navigate('/danisanlar/yeni'),
      },
    ],
  }
}

// AYAR ARAMASI: settings-search.ts'teki statik kayıt defterinden üretilir.
// cmdk'nın kendi filtresi daraltır — bu yüzden liste TAMAMIyla render edilir;
// eşleşmeyen girdilerin grup başlığı cmdk tarafından otomatik gizlenir.
function buildSettingsSearchGroup(
  role: ClinicMemberRole,
  navigate: (href: string) => void,
): CommandPaletteGroup {
  return {
    heading: 'Ayarlar ve bölümler',
    items: visibleSettingsEntries(role).map((entry) => ({
      id: entry.id,
      label: entry.label,
      description: entry.description,
      icon: entry.icon,
      badge: entry.kind === 'bölüm' ? 'Bölüm' : 'Ayar',
      searchValue: `${entry.label} ${entry.description} ${entry.keywords}`,
      onSelect: () => navigate(entry.href),
    })),
  }
}

// GitHub issue #39 / Prompt 7.1 GÜNCELLEMESİ: "Danışan ara" artık GERÇEK bir
// arama — GitHub issue #25'in bıraktığı "yakında" stub'ı burada kapanıyor.
// Besin aramasındaki AYNI desen (ZATEN filtrelenmiş bir `hits` listesini
// gösteren grup): arama mantığı burada TEKRARLANMIYOR, randevu modülünün
// searchClientsAction'ı AYNEN çağrılıyor.
function buildClientSearchGroup(
  hits: ClientPickerOption[],
  onSelectClient: (client: ClientPickerOption) => void,
): CommandPaletteGroup {
  return {
    heading: 'Danışanlar',
    items: hits.map((client) => ({
      id: `client-${client.id}`,
      label: `${client.firstName} ${client.lastName}`,
      icon: UserRound,
      badge: 'Danışan',
      // UUID'nin bir kısmı yazılarak da bulunabilsin diye id de eşleşme
      // değerine eklenir (destek/hata ayıklama senaryoları için).
      searchValue: `${client.firstName} ${client.lastName} ${client.id}`,
      onSelect: () => onSelectClient(client),
    })),
  }
}

// GitHub issue #24 / Prompt 5.2 GÖREV 3 — issue #11'in bıraktığı genişletme
// notu tam olarak burada gerçekleşiyor.
//
// GitHub issue #25 GÜNCELLEMESİ: "plan editöründeyken ⌘K → besin arama
// moduna girsin, seçilince aktif öğüne eklensin" davranışı ÇALIŞIYOR — bkz.
// lib/stores/active-meal-store.ts.
//
// DİĞER build*Group()'lardan FARKI: onlar durağan girdilerle SABİT liste
// üretir (cmdk kendi fuzzy filtresiyle daraltır) — burası ZATEN filtrelenmiş
// (Orama'dan gelen) bir sonuç listesi alır, çünkü 10.000+ besini tek seferde
// CommandItem olarak render etmek hem performans hem doğruluk açısından
// yanlış olurdu.
function buildFoodSearchGroup(
  hits: FoodSearchHit[],
  onSelectFood: (hit: FoodSearchHit) => void,
): CommandPaletteGroup {
  return {
    heading: 'Besinler',
    items: hits.map((hit) => ({
      id: `food-${hit.id}`,
      label: hit.nameTr,
      description:
        hit.kcalPer100g !== null ? `${hit.kcalPer100g.toFixed(0)} kcal / 100 g` : undefined,
      icon: UtensilsCrossed,
      badge: 'Besin',
      searchValue: hit.nameTr,
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
  query: string,
  onSelectFood: (hit: FoodSearchHit) => void,
  clientHits: ClientPickerOption[],
  onSelectClient: (client: ClientPickerOption) => void,
): CommandPaletteGroup[] {
  return useMemo(() => {
    const groups = [buildNavigationGroup(role, navigate), buildQuickActionsGroup(navigate)]
    // Sorgu boşken (henüz bir şey yazılmadıysa) arama-sonucu grupları hiç
    // eklenmez — boş "Ayarlar"/"Danışanlar" başlıkları kafa karıştırır. Boş
    // durum = sayfalar + hızlı eylemler; kullanıcı yazmaya başlayınca ayar,
    // danışan ve besin sonuçları belirir. Hızlı eylemler her zaman
    // render edilir ki "yeni danışan" gibi sorgularla da bulunabilsin;
    // eşleşmeyen grubu cmdk otomatik gizler.
    if (query.trim() === '') {
      return groups
    }
    groups.push(buildSettingsSearchGroup(role, navigate))
    if (clientHits.length > 0) {
      groups.push(buildClientSearchGroup(clientHits, onSelectClient))
    }
    if (foodHits.length > 0) {
      groups.push(buildFoodSearchGroup(foodHits, onSelectFood))
    }
    return groups
  }, [role, navigate, foodHits, query, onSelectFood, clientHits, onSelectClient])
}

// Tek satır: simge kutucuğu + etiket/açıklama + sağda tip rozeti.
// `[&>svg:last-child]:hidden` — ui/command.tsx'in CommandItem'ı seçimde
// sağa CheckIcon basıyor; bizim rozetimiz aynı yeri kapladığından o varsayılan
// onay işaretini gizliyoruz (seçili satır zaten bg-muted ile vurgulanıyor).
function PaletteRow({ item }: { item: PaletteItem }) {
  return (
    <CommandItem
      value={item.searchValue}
      onSelect={() => item.onSelect?.()}
      className="gap-3 py-2 [&>svg:last-child]:hidden"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
        <item.icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight">{item.label}</span>
        {item.description ? (
          <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">
            {item.description}
          </span>
        ) : null}
      </span>
      {item.badge ? (
        <Badge
          variant="outline"
          className="shrink-0 rounded-lg border-border/70 px-2 py-0.5 text-[0.68rem] font-normal text-muted-foreground group-data-[selected=true]/command-item:border-border group-data-[selected=true]/command-item:text-foreground/80"
        >
          {item.badge}
        </Badge>
      ) : null}
    </CommandItem>
  )
}

function FooterHint({ keys, children }: { keys: string[]; children: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[0.6rem] text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
      {children}
    </span>
  )
}

export function CommandPaletteView({ role, onNavigate, searchClients }: { role: ClinicMemberRole; onNavigate: (href: string) => void; searchClients: (query: string) => Promise<ClientPickerOption[]> }) {
  const [open, setOpen] = useState(false)
  const [foodIndexReady, setFoodIndexReady] = useState(false)
  const [query, setQuery] = useState('')
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
    if (!foodIndexReady || query.trim() === '') {
      setFoodHits([])
      return
    }
    let cancelled = false
    searchFoodsOffline(query, 8).then((result) => {
      if (!cancelled) setFoodHits(result.hits)
    })
    return () => {
      cancelled = true
    }
  }, [query, foodIndexReady])

  // Danışan araması — besin indeksinden FARKLI olarak sunucuya gidiyor
  // (offline indeks yok; klinik başına yüz/bin mertebesindeki danışan verisi
  // basit bir ILIKE'a yetiyor, bkz. listClients üstündeki not). 200ms debounce
  // tuş vuruşlarında gereksiz istek atılmasını engeller.
  useEffect(() => {
    if (query.trim() === '') {
      setClientHits([])
      return
    }
    let cancelled = false
    const timeout = setTimeout(() => {
      searchClients(query).then((hits) => {
        if (!cancelled) setClientHits(hits)
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [query, searchClients])

  // Palet kapanınca sorgu sıfırlanır — bir sonraki açılışta önceki aramanın
  // kalıntısı görünmesin diye.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      onNavigate(href)
    },
    [onNavigate],
  )

  const addFoodToActiveMeal = useActiveMealStore((state) => state.addFoodToActiveMeal)
  const activeMealLabel = useActiveMealStore((state) => state.activeMealLabel)

  // Plan editöründe bir öğün aktifse GERÇEK ekleme, değilse bilgi tostu —
  // hiçbir yere "eklendi" gibi yanıltmasın.
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
      onNavigate(`/danisanlar/${client.id}`)
    },
    [onNavigate],
  )

  const trimmedQuery = query.trim()
  const groups = useCommandPaletteGroups(
    role,
    navigate,
    foodHits,
    query,
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
        data-command-trigger
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
        title="Arama"
        description="Sayfalar, ayarlar, danışanlar ve besinler arasında arama yapın."
        className="sm:max-w-[36rem]"
      >
        <CommandInput
          placeholder="Sayfa, ayar veya danışan arayın…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[min(26rem,55vh)]">
          <CommandEmpty>
            {trimmedQuery !== '' ? `“${trimmedQuery}” için sonuç bulunamadı.` : 'Sonuç bulunamadı.'}
          </CommandEmpty>
          {groups.map((group, index) => (
            <div key={group.heading}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.items.map((item) => (
                  <PaletteRow key={item.id} item={item} />
                ))}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
        <div className="flex items-center gap-4 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
          <FooterHint keys={['↑', '↓']}>ile gezin</FooterHint>
          <FooterHint keys={['↵']}>aç</FooterHint>
          <FooterHint keys={['esc']}>kapat</FooterHint>
        </div>
      </CommandDialog>
    </>
  )
}
