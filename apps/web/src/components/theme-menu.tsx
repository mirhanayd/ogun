'use client'

import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

// GitHub issue #59 / Faz 10, Prompt 10.1, GÖREV 2 — UYGULAMA İÇİ tema
// anahtarı (açık / koyu / sistem). Kullanıcı menüsüne (bkz. app/(app)/
// _components/user-menu.tsx) bir alt menü olarak takılır.
//
// NATIVE MENÜYLE ÇAKIŞMA YOK — bunu eklerken kontrol edildi: Tauri
// menüsündeki "Görünüm > Tema" öğeleri (bkz. apps/desktop/src-tauri/src/
// menu.rs) BİLEREK düz `MenuItem`, `CheckMenuItem` DEĞİL; yani native taraf
// hiçbir "seçili" durum TUTMUYOR, yalnızca bir `ogun-menu-set-theme` olayı
// yayınlıyor. O olay native-theme-bridge.tsx üzerinden yine next-themes'in
// `setTheme()`'ine gidiyor. Dolayısıyla İKİ yüzey de TEK bir doğruluk
// kaynağını (next-themes / localStorage) yazıyor, birbirlerinin durumunu
// ezmiyorlar; buradaki radyo işareti native menüden yapılan değişiklikte de
// doğru kalır çünkü `useTheme()` aynı store'u okur.
//
// `mounted` bekçisi: next-themes çözümlenmiş temayı ancak istemcide bilir;
// sunucu render'ında `theme` undefined olur ve bekçi olmadan radyo işareti
// hidrasyonda kayar.
const THEME_OPTIONS = [
  { value: 'light', label: 'Açık', Icon: Sun },
  { value: 'dark', label: 'Koyu', Icon: Moon },
  { value: 'system', label: 'Sistem', Icon: Monitor },
] as const

export function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const current = mounted ? (theme ?? 'system') : 'system'
  const ActiveIcon = (THEME_OPTIONS.find((option) => option.value === current) ?? THEME_OPTIONS[2]).Icon

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ActiveIcon className="size-4" />
        Tema
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={current} onValueChange={setTheme}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
