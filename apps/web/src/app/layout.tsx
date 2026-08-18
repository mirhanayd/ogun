import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'
import { NativeAuthBridge } from '@/components/native-auth-bridge'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
})

export const metadata: Metadata = {
  title: 'Öğün',
}

// GitHub issue #59 / Faz 10, Prompt 10.1 — tarayıcı krom rengi iki temada
// da uygulamanın kendi zeminiyle aynı olsun (globals.css --background).
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fcfa' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1512' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    // suppressHydrationWarning: next-themes <html> üzerindeki `class`ı
    // istemcide, hidrasyondan ÖNCE yazar (bkz. providers.tsx). Bu bekçi
    // olmadan React her sayfa yüklemesinde uyumsuzluk uyarısı basar.
    <html lang="tr" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        {/* GitHub issue #52 / Prompt 9.2 — native (Tauri) kabukta oturum
            kalıcılığı + OAuth deep link köprüsü; web tarayıcısında NO-OP
            (bkz. native-auth-bridge.tsx dosya başı notu). */}
        <NativeAuthBridge>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </NativeAuthBridge>
      </body>
    </html>
  )
}
