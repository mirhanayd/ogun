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
//
// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 3 — "Klavye kısayolları
// yardım kartı (? tuşu) zaten var — GÜNCEL OLDUĞUNU DOĞRULA". Doğrulandı ve
// BAYAT ÇIKTI; iki kaynaktan:
//   1. GitHub issue #53 (native menü, bkz. apps/desktop/src-tauri/src/
//      menu.rs) GERÇEK hızlandırıcılar (accelerator) ekledi — Ctrl+N, Ctrl+,
//      Ctrl+Q, Ctrl+Plus/-/0 — ve bunların HİÇBİRİ kartta yoktu. Bu tuşlar
//      SADECE masaüstü kabuğunda çalışır (tarayıcıda Ctrl+N yeni pencere
//      açar), bu yüzden ilgili grup `isNativeShell()` doğruyken gösteriliyor:
//      tarayıcıda çalışmayan bir kısayolu listelemek de "uydurma" olurdu.
//   2. GitHub issue #61 araç çubuğunu yeniden düzenledi: PDF ve "Şablona
//      dönüştür" eylemleri artık taşma ("…") menüsünde, plan üstverisi
//      "Plan ayarları" popover'ında. Kart "Esc: açık bir diyaloğu/paneli
//      kapat" diyordu; bu yüzeyler de aynı tuşla kapanıyor ve Tab sırası
//      artık arama → miktar → sonraki kalem olarak uçtan uca çalışıyor
//      (apps/e2e/tests/keyboard-navigation.spec.ts bunu DOĞRULUYOR).
interface ShortcutGroup {
  heading: string
  // true ise grup yalnızca masaüstü (Tauri) kabuğunda gösterilir.
  nativeOnly?: boolean
  items: Array<{ keys: string[]; description: string }>
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    heading: 'Genel',
    items: [
      { keys: ['Ctrl', 'K'], description: 'Komut paletini aç (sayfa git, danışan/besin ara)' },
      { keys: ['?'], description: 'Bu yardım kartını aç/kapat' },
      { keys: ['Esc'], description: 'Açık bir diyaloğu, paneli, taşma menüsünü veya ayar penceresini kapat' },
      { keys: ['Tab'], description: 'Bir sonraki öğeye geç (odaklanan öğe marka renkli halkayla belirir)' },
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
      { keys: ['Tab'], description: 'Kaydet ve sıradaki alana geç (arama → miktar → sonraki kalem)' },
      { keys: ['Esc'], description: 'Düzenlemeden vazgeç' },
    ],
  },
  {
    heading: 'Masaüstü uygulaması',
    nativeOnly: true,
    items: [
      { keys: ['Ctrl', 'N'], description: 'Yeni danışan' },
      { keys: ['Ctrl', ','], description: 'Ayarlar' },
      { keys: ['Ctrl', '+'], description: 'Yakınlaştır' },
      { keys: ['Ctrl', '-'], description: 'Uzaklaştır' },
      { keys: ['Ctrl', '0'], description: 'Yakınlaştırmayı sıfırla' },
      { keys: ['Ctrl', 'Q'], description: 'Uygulamadan çık' },
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
  // isNativeShell() `window.__TAURI_INTERNALS__`e bakar — sunucuda YOK.
  // Doğrudan render sırasında çağırmak hidrasyon uyumsuzluğu üretirdi, bu
  // yüzden mount sonrası bir kez okunuyor (web'de değer HİÇ değişmez).
  const [native, setNative] = useState(false)

  useEffect(() => {
    setNative(isNativeShell())
  }, [])

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
            {SHORTCUT_GROUPS.filter((group) => !group.nativeOnly || native).map((group) => (
              <div key={group.heading} className="flex flex-col gap-2">
                <p className="text-helper font-medium text-muted-foreground uppercase">{group.heading}</p>
                {group.items.map((item) => (
                  <div key={item.description} className="flex items-center justify-between gap-3 text-body">
                    <span>{item.description}</span>
                    <span className="flex shrink-0 gap-1">
                      {item.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-helper"
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
