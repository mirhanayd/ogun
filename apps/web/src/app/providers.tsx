'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { NativeThemeBridge } from '@/components/native-theme-bridge'

// GitHub issue #53 / Prompt 9.3, GÖREV 1 — `next-themes` ZATEN bir
// bağımlılıktı (bkz. package.json, sonner.tsx'in `useTheme()` çağrısı)
// ama HİÇBİR YERDE bir `<ThemeProvider>` KURULU değildi — globals.css'teki
// TAM `.dark { ... }` bloğu hiç AKTİVE olmuyordu. Native menünün Görünüm >
// Tema alt menüsünü (bkz. native-theme-bridge.tsx) işlevsel kılmak için bu
// eksik teli (wiring) tamamlıyoruz — apps/web'e YENİ bir tasarım sistemi
// EKLEMİYORUZ, zaten var olanı AKTİVE ediyoruz.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <NativeThemeBridge />
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  )
}
