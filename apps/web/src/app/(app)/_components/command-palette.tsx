'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, UserPlus, type LucideIcon } from 'lucide-react'
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
function buildNavigationGroup(role: ClinicMemberRole, navigate: (href: string) => void): CommandPaletteGroup {
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

// GitHub issue #17 / Prompt 4.1 danışan modülünü kurdu — bu yüzden "Yeni
// danışan" artık gerçek bir navigasyon (/danisanlar/yeni). "Danışan ara"
// BİLEREK hâlâ devre dışı: bu, komut paletinin İÇİNDE bir fuzzy arama
// (ör. Orama tabanlı, bkz. lib/food-index.ts'teki besin arama deseni) ayrı
// bir iş — /danisanlar sayfasının kendi arama kutusu (bkz. clients-table.tsx)
// bunun yerine geçmiyor, komut paletine entegre bir "ara ve seç" akışı
// henüz kurulmadı.
function buildClientCommandGroup(navigate: (href: string) => void): CommandPaletteGroup {
  return {
    heading: 'Danışanlar',
    items: [
      { id: 'client-search', label: 'Danışan ara', icon: Search, disabled: true },
      {
        id: 'client-create',
        label: 'Yeni danışan',
        icon: UserPlus,
        onSelect: () => navigate('/danisanlar/yeni'),
      },
    ],
  }
}

// GENİŞLETME NOKTASI: yeni bir komut grubu eklemek, `build*Group()` biçiminde
// bir fonksiyon yazıp aşağıdaki diziye eklemekten ibaret — mevcut gruplar
// yeniden yapılandırılmaz. Örn. Hafta 5'te besin arama, buraya bir
// `buildFoodSearchGroup()` olarak eklenecek (bkz. GitHub issue #11 gövdesi,
// "mimariyi genişletilebilir kur" notu).
function useCommandPaletteGroups(role: ClinicMemberRole, navigate: (href: string) => void): CommandPaletteGroup[] {
  return useMemo(() => [buildNavigationGroup(role, navigate), buildClientCommandGroup(navigate)], [role, navigate])
}

export function CommandPalette({ role }: { role: ClinicMemberRole }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

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

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  const groups = useCommandPaletteGroups(role, navigate)

  return (
    <>
      {/* Üst bardaki "arama" girişi — GitHub issue #11'in istediği "stub input"
          değil, doğrudan komut paletini açan gerçek bir tetikleyici. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 w-full max-w-64 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted dark:bg-input/30"
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
        <CommandInput placeholder="Bir komut yazın veya arayın…" />
        <CommandList>
          <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
          {groups.map((group, index) => (
            <div key={group.heading}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem key={item.id} disabled={item.disabled} onSelect={() => item.onSelect?.()}>
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
