import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'
import { NativeAuthBridge } from '@/components/native-auth-bridge'
import { getSiteUrl } from '@/lib/site-url'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin', 'latin-ext'],
})

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 3 — `metadataBase`, Next.js'in
// göreli metadata URL'lerini (canonical, opengraph-image) MUTLAK hâle
// getirebilmesi için gerekir; tanımlı olmadan build sırasında uyarı basar ve
// OG görseli paylaşımlarda çözülemez. Sayfa bazlı başlık/açıklama ilgili
// sayfada tanımlı (bkz. app/page.tsx, app/indir/page.tsx); buradaki `title`
// yalnızca kendi metadata'sını tanımlamayan rotalar için varsayılan.
export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
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
    // GitHub issue #60 — `inter.variable` <body>'DEN <html>'e TAŞINDI.
    // BULUNAN GERÇEK HATA (bu issue'nun konusu DEĞİL, landing sayfasının
    // ekran görüntüsü alınırken fark edildi): issue #59 globals.css'e
    // `@layer base { html { @apply font-sans } }` ekledi, yani font-family
    // <html> üzerinde `var(--font-sans)` olarak çözülüyor — ama Inter'in
    // ürettiği `--font-sans` değişkeni <body>'de tanımlıydı. CSS değişkenleri
    // AŞAĞI doğru kalıtılır, YUKARI değil: <html>'de değişken TANIMSIZ
    // kalıyor, font-family bildirimi geçersiz sayılıyor ve TÜM UYGULAMA
    // tarayıcının varsayılan SERIF yazı tipiyle basılıyordu (/giris dahil —
    // ekran görüntüsüyle doğrulandı, landing'e özgü DEĞİL). Değişkeni
    // <html>'e taşımak tek satırlık ve davranışı bozmayan düzeltme;
    // `antialiased` <body>'de kalıyor.
    <html lang="tr" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased">
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
