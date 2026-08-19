import { PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons'

// GitHub issue #62 / Prompt 10.4, GÖREV 1 — danışan listesi bir TABLO
// (bkz. clients-table.tsx); (app)/loading.tsx'in kart ızgarası iskeleti
// buranın yerleşimine hiç benzemiyordu.
export default function DanisanlarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeaderSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </div>
  )
}
