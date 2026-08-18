import type { Metadata } from 'next'
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr">
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
