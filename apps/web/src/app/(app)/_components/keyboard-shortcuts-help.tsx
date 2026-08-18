'use client'

import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isNativeShell } from '@/lib/native-shell'

// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "Klavye kısayolları yardım kartı
// (? tuşu)". Liste UYDURULMADI — uygulamada GERÇEKTEN çalışan kısayollar
// taranarak çıkarıldı:
//   - command-palette.tsx: Ctrl/Cmd+K (GitHub issue #11/#24/#25/#39)
//   - plan-item-row.tsx (GitHub issue #25): miktar/besin hücresine
//     tıklayınca düzenleme moduna girer; Tab/Enter bir sonraki alana geçer
//     VE kaydeder, Escape düzenlemeyi iptal eder.
//   - food-search-input.tsx (GitHub issue #24): sonuç listesinde
//     Yukarı/Aşağı ok tuşlarıyla gezinme, Enter ile seçme, Escape ile kapama,
//     Tab ile miktar alanına geçme.
// Yeni bir kısayol eklendiğinde BURAYA da eklenmesi gerekir — aksi halde bu
// kart "uydurma" bir belgeye dönüşür.
const SHORTCUT_GROUPS: Array<{ heading: string; items: Array<{ keys: string[]; description: string }> }> = [
  {
    heading: 'Genel',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Komut paletini aç (sayfa git, danışan/besin ara)' },
      { keys: ['?'], description: 'Bu yardım kartını aç' },
      { keys: ['Esc'], description: 'Açık bir diyaloğu/paneli kapat' },
    ],
  },
  {
    heading: 'Besin arama',
    items: [
      { keys: ['↑', '↓'], description: 'Sonuç listesinde gezin' },
      { keys: ['Enter'], description: 'Seçili besini ekle' },
      { keys: ['Tab'], description: 'Miktar alanına geç' },
    ],
  },
  {
    heading: 'Plan editörü — satır içi düzenleme',
    items: [
      { keys: ['Tıkla'], description: 'Miktar/besin hücresini düzenlemeye aç' },
      { keys: ['Enter'], description: 'Kaydet' },
      { keys: ['Tab'], description: 'Kaydet ve sıradaki alana geç' },
      { keys: ['Esc'], description: 'Düzenlemeden vazgeç' },
    ],
  },
]

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // '?' fiziksel tuşu Shift+/ ile üretilir — event.key zaten '?' değerini
      // verir, ayrıca shiftKey kontrolüne gerek yok. Bir metin alanına
      // yazarken (ör. bir not alanına "soru işareti" karakterinin kendisi
      // girilirken) yardım kartı AÇILMASIN diye isTypingTarget kontrolü var.
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // GitHub issue #53 / Prompt 9.3, GÖREV 1 — native Yardım menüsündeki
  // "Klavye Kısayolları" öğesi (bkz. apps/desktop/src-tauri/src/
  // menu_actions.rs) apps/web'e YENİ bir diyalog EKLEMEK yerine bu MEVCUT
  // diyaloğu bir Tauri olayıyla açar — "?" tuşuyla açmakla AYNI mekanizma.
  useEffect(() => {
    if (!isNativeShell()) return
    const unlistenPromise = listen('ogun-menu-open-shortcuts', () => setOpen(true))
    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  return (
    <>
      <Button variant="ghost" size="icon" title="Klavye kısayolları (?)" onClick={() => setOpen(true)}>
        <Keyboard className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Klavye kısayolları</DialogTitle>
            <DialogDescription>Bu kartı istediğiniz zaman &quot;?&quot; tuşuyla açabilirsiniz.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.heading} className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">{group.heading}</p>
                {group.items.map((item) => (
                  <div key={item.description} className="flex items-center justify-between gap-3 text-sm">
                    <span>{item.description}</span>
                    <span className="flex shrink-0 gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
