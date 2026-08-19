import { CardGridSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from '@/components/skeletons'

// Next.js'in dosya tabanlı Suspense sınırı: (app) grubu altındaki herhangi
// bir sayfa (kendi loading.tsx'i yoksa) sunucuda veri beklerken bu iskelet
// gösterilir — bkz. GitHub issue #11 / Prompt 3.2, GÖREV 4 ("kabuğun async
// sınırları için skeleton bileşenleri").
//
// GitHub issue #62 / Prompt 10.4, GÖREV 1 — bu VARSAYILAN iskelet artık
// /panel'in gerçek yerleşimini (başlık + dört özet kart + iki sütunlu kart
// bloğu) taklit ediyor; /panel bu grubun kendi loading.tsx'i OLMAYAN en
// önemli sayfası. Kendi yerleşimi belirgin biçimde farklı olan sayfalar
// (danışan tablosu, randevu takvimi, finans, şablon kütüphanesi) artık
// KENDİ loading.tsx'lerini taşıyor.
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton withAction={false} />
      <StatCardsSkeleton />
      <CardGridSkeleton count={2} columns={2} lines={3} />
    </div>
  )
}
