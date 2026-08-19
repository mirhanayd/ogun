import { CardGridSkeleton, PageHeaderSkeleton, StatCardsSkeleton } from '@/components/skeletons'

// GitHub issue #62 / Prompt 10.4, GÖREV 1 — /finans'ın gerçek yerleşimi:
// başlık + ay gezinme şeridi, dört özet kart, iki sütunlu kart bloğu
// (diyetisyen cirosu / ödeme yöntemi), altında paket ve gider yöneticisi.
export default function FinansLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <StatCardsSkeleton />
      <CardGridSkeleton count={2} columns={2} lines={3} />
      <CardGridSkeleton count={2} columns={2} lines={3} />
    </div>
  )
}
