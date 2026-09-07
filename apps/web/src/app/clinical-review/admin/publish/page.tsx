import React from 'react'
import Link from 'next/link'
import { db } from '@ogun/db'
import {
  getClinicalReviewDecisions,
  listClinicalReviewTasks,
} from '@ogun/db/queries'
import { requireClinicalAdmin } from '@/lib/clinical-review/authz'
import { PublishQueueList } from './_components/publish-queue-list'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  Users,
  History,
} from 'lucide-react'

export default async function ClinicalReviewAdminPublishPage() {
  const session = await requireClinicalAdmin()

  const { tasks } = await listClinicalReviewTasks(db, {
    status: 'ready_to_publish',
    limit: 100,
  })

  // Fetch decisions for each ready task to show consensus preview
  const tasksWithDecisions = await Promise.all(
    tasks.map(async (task) => {
      const decisions = await getClinicalReviewDecisions(db, task.id, false)
      return {
        ...task,
        decisions: decisions.map((d) => ({
          reviewerName: d.reviewerName,
          reviewerRole: d.reviewerRole ?? 'clinical_reviewer',
          severity: d.severity,
          evidenceStrength: d.evidenceStrength,
          approvedTargetKey: d.approvedTargetKey,
          approvedAction: d.approvedAction,
          titleTr: d.titleTr,
          clinicalEffectTr: d.clinicalEffectTr,
          mechanismTr: d.mechanismTr,
          recommendationTr: d.recommendationTr,
          createdAt: d.createdAt,
        })),
      }
    }),
  )

  const canPublish = session.profile.canPublish === true

  return (
    <div className="space-y-6">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/clinical-review" className="hover:text-foreground transition-colors">
              Genel Bakış
            </Link>
            <span>/</span>
            <span className="text-foreground">Klinik Yönetici</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Yayınlamaya Hazır İncelemeler
            </h1>
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold">
              {tasks.length} Aday
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Gerekli hakem sayısı, uzmanlık yetkinlikleri ve atıf kontrolleri tamamlanmış adaylar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/clinical-review/admin/reviewers">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              <span>Hakemler</span>
            </Button>
          </Link>
          <Link href="/clinical-review/admin/audit">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <History className="h-3.5 w-3.5" />
              <span>Denetim İzi (Audit)</span>
            </Button>
          </Link>
        </div>
      </div>

      {!canPublish && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-800 dark:text-amber-300">
          <strong>Yayınlama İzni Kısıtlı:</strong> Profilinizde yayınlama yetkisi (<code>can_publish</code>) tanımlı değildir.
          Adayları ve onay durumlarını inceleyebilirsiniz ancak canlıya aktarma butonu yalnızca tam yetkili yöneticilere açıktır.
        </div>
      )}

      {/* Publish Queue List */}
      <PublishQueueList
        tasks={tasksWithDecisions}
        canPublish={canPublish}
      />
    </div>
  )
}
