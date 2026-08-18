'use client'

import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useTheme } from 'next-themes'
import { isNativeShell } from '@/lib/native-shell'

// GitHub issue #53 / Prompt 9.3, GÖREV 1 — "Görünüm > Tema (Açık/Koyu/
// Sistem)" native menü öğeleri (bkz. apps/desktop/src-tauri/src/
// menu_actions.rs `emit_theme`) bir `ogun-menu-set-theme` Tauri olayı
// yayınlar; bu köprü onu dinleyip next-themes'in `setTheme()`'ine iletir.
//
// TASARIM KARARI (bkz. PR açıklaması) — next-themes ZATEN apps/web'in bir
// bağımlılığıydı (package.json) ve globals.css'te TAM bir `.dark { ... }`
// CSS değişken bloğu + `@custom-variant dark (&:is(.dark *))` (bkz. o
// dosya) ZATEN vardı — sadece HİÇBİR YERDE bir `<ThemeProvider>` KURULU
// değildi, yani karanlık mod CSS'i asla AKTİVE olmuyordu. Bu, native
// menünün Tema alt menüsünü işlevsel kılmak için gerçekten GEREKLİ,
// minimal bir tel (wiring) eklemesi — Faz 10'un (tasarım cilası) GÖRÜNÜR
// bir uygulama-içi tema anahtarı (toggle) EKLEMESİ hâlâ ayrı bir iş;
// burada SADECE native menünün altyapısal bağlantısı kuruldu.
export function NativeThemeBridge() {
  const { setTheme } = useTheme()

  useEffect(() => {
    if (!isNativeShell()) return

    const unlistenPromise = listen<'light' | 'dark' | 'system'>('ogun-menu-set-theme', (event) => {
      setTheme(event.payload)
    })

    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [setTheme])

  return null
}
