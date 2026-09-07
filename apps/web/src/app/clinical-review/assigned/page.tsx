import React from 'react'
import Link from 'next/link'
import { db } from '@ogun/db'
import { listClinicalReviewTasks } from '@ogun/db/queries'
import { requireReviewer } from '@/lib/clinical-review/authz'
import { QueueList } from '../queue/_components/queue-list'
import { Button } from '@/components/ui/button'
import { UserCheck, ListFilter } from 'lucide-react'

export default async function ClinicalReviewAssignedPage() {
  const session = await requireReviewer()

  const { tasks, total } = await listClinicalReviewTasks(db, {
    assignedReviewerId: session.user.id,
    limit: 100,
  })

  const isVerified = session.profile.verificationStatus === 'verified' && session.profile.isActive

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Bana Atanan İncelemeler
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Aktif olarak size atanmış veya talep ettiğiniz <strong className="text-foreground">{total}</strong> klinik aday bulunuyor.
          </p>
        </div>

        <Link href="/clinical-review/queue">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <ListFilter className="h-3.5 w-3.5" />
            <span>Tüm Havuzu Gör</span>
          </Button>
        </Link>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserCheck className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">Henüz Atanmış Aday Yok</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Üzerinizde bekleyen aktif bir inceleme bulunmuyor. İnceleme havuzundan uzmanlık alanınıza uygun
            adayları seçebilir ve incelemeye başlayabilirsiniz.
          </p>
          <div className="mt-6">
            <Link href="/clinical-review/queue">
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5">
                <ListFilter className="h-4 w-4" />
                <span>Havuzdan Aday Seç</span>
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <QueueList
          tasks={tasks}
          currentUserId={session.user.id}
          isVerified={isVerified}
        />
      )}
    </div>
  )
}
