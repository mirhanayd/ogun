import type { Metadata } from 'next'
import { Compass } from 'lucide-react'
import { ErrorScreen } from '@/components/error-screen'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — kök 404. Next.js'in
// varsayılan siyah-beyaz "404 | This page could not be found" ekranının
// yerini alır (o ekran İNGİLİZCE ve markasızdı).
export const metadata: Metadata = {
  title: 'Sayfa bulunamadı — Öğün',
}

export default function RootNotFound() {
  return (
    <ErrorScreen
      icon={Compass}
      code="404"
      title="Böyle bir sayfa yok"
      description="Adres yanlış yazılmış ya da bağlantı artık geçerli değil olabilir. Paylaşılan bir plan bağlantısını açmaya çalışıyorsanız süresi dolmuş olabilir — diyetisyeninizden yeni bir bağlantı isteyin."
      actions={[
        { label: 'Ana sayfaya dön', href: '/' },
        { label: 'Giriş yap', href: '/giris', variant: 'outline' },
      ]}
      className="min-h-svh"
    />
  )
}
