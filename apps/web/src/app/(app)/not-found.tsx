import { SearchX } from 'lucide-react'
import { ErrorScreen } from '@/components/error-screen'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — (app) segmenti için 404.
// Uygulama İÇİNDE bir 404 neredeyse her zaman "kayıt yok/silinmiş" anlamına
// gelir (ör. arşivlenmiş bir danışanın eski bağlantısı, silinmiş bir plan),
// kök 404'ün "adres yanlış" varsayımından farklıdır — metin buna göre.
// Kabuk (kenar çubuğu, üst bar) korunur.
export default function AppNotFound() {
  return (
    <ErrorScreen
      icon={SearchX}
      code="404"
      title="Kayıt bulunamadı"
      description="Aradığınız danışan, plan veya randevu silinmiş ya da başka bir kliniğe ait olabilir. Listeden yeniden seçerek devam edin."
      actions={[
        { label: 'Danışanlara git', href: '/danisanlar' },
        { label: 'Panele dön', href: '/panel', variant: 'outline' },
      ]}
    />
  )
}
