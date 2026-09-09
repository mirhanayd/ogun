import React from 'react'
import Link from 'next/link'
import { db } from '@ogun/db'
import {
  listClinicalReviewTasks,
  type ClinicalReviewPriority,
  type ClinicalReviewTaskStatus,
} from '@ogun/db/queries'
import { requireClinicalAdmin } from '@/lib/clinical-review/authz'
import { QueueFilters } from './_components/queue-filters'
import { QueueList } from './_components/queue-list'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface QueuePageProps {
  searchParams: Promise<{
    search?: string
    priority?: string
    status?: string
    requiredCapability?: string
    confidence?: string
    attribution?: string
    offset?: string
  }>
}

export default async function ClinicalReviewQueuePage({ searchParams }: QueuePageProps) {
  const session = await requireClinicalAdmin()
  const params = await searchParams

  const limit = 25
  const offset = params.offset ? Math.max(parseInt(params.offset, 10) || 0, 0) : 0

  const { tasks, total } = await listClinicalReviewTasks(db, {
    searchQuery: params.search,
    priority: (params.priority && params.priority !== 'all' ? params.priority : undefined) as
      ClinicalReviewPriority | undefined,
    status: (params.status && params.status !== 'all' ? params.status : undefined) as
      ClinicalReviewTaskStatus | undefined,
    requiredCapability:
      params.requiredCapability && params.requiredCapability !== 'all'
        ? params.requiredCapability
        : undefined,
    candidateConfidence:
      params.confidence && params.confidence !== 'all' ? params.confidence : undefined,
    ingredientAttribution:
      params.attribution && params.attribution !== 'all' ? params.attribution : undefined,
    limit,
    offset,
  })

  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit) || 1

  // Helper to build page URL preserving other search params
  const buildPageUrl = (newOffset: number) => {
    const q = new URLSearchParams()
    if (params.search) q.set('search', params.search)
    if (params.priority) q.set('priority', params.priority)
    if (params.status) q.set('status', params.status)
    if (params.requiredCapability) q.set('requiredCapability', params.requiredCapability)
    if (params.confidence) q.set('confidence', params.confidence)
    if (params.attribution) q.set('attribution', params.attribution)
    if (newOffset > 0) q.set('offset', String(newOffset))
    return `/clinical-review/queue?${q.toString()}`
  }

  const isVerified = session.profile.verificationStatus === 'verified' && session.profile.isActive

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/80 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Klinik İnceleme Havuzu
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Toplam <strong className="text-foreground">{total}</strong> aday listeleniyor (Sayfa{' '}
            {currentPage} / {totalPages})
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <QueueFilters
        currentFilters={{
          search: params.search,
          priority: params.priority,
          status: params.status,
          requiredCapability: params.requiredCapability,
          confidence: params.confidence,
          attribution: params.attribution,
        }}
      />

      {/* Task List (Responsive: Cards on Mobile, Table on Desktop) */}
      <QueueList tasks={tasks} currentUserId={session.user.id} isVerified={isVerified} />

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border/80 pt-4 text-xs text-muted-foreground">
          <div>
            Gösterilen: <strong>{offset + 1}</strong> -{' '}
            <strong>{Math.min(offset + limit, total)}</strong> / Toplam: <strong>{total}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={buildPageUrl(Math.max(offset - limit, 0))}
              aria-disabled={offset === 0}
              className={offset === 0 ? 'pointer-events-none opacity-50' : ''}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                className="gap-1 h-8 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Önceki
              </Button>
            </Link>

            <span className="text-xs font-medium px-2">
              {currentPage} / {totalPages}
            </span>

            <Link
              href={buildPageUrl(offset + limit)}
              aria-disabled={offset + limit >= total}
              className={offset + limit >= total ? 'pointer-events-none opacity-50' : ''}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={offset + limit >= total}
                className="gap-1 h-8 text-xs"
              >
                Sonraki
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
