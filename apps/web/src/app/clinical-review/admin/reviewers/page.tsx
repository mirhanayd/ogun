import React from 'react'
import Link from 'next/link'
import { db } from '@ogun/db'
import { listClinicalReviewers } from '@ogun/db/queries'
import { requireClinicalAdmin } from '@/lib/clinical-review/authz'
import { ReviewerTable } from './_components/reviewer-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  Ban,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react'

export default async function ClinicalReviewAdminReviewersPage() {
  const session = await requireClinicalAdmin()

  const reviewers = await listClinicalReviewers(db)

  const verifiedCount = reviewers.filter((r) => r.verificationStatus === 'verified').length
  const pendingCount = reviewers.filter((r) => r.verificationStatus === 'pending').length
  const suspendedCount = reviewers.filter((r) => r.verificationStatus === 'suspended').length

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
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Klinik Hakem Kadrosu & Yetkilendirme
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Uzmanların mesleki doğrulamalarını, yetkinlik alanlarını ve yayınlama izinlerini yönetin.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/clinical-review/admin/publish">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Yayınlama Kuyruğu</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Toplam Başvuru</span>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-2">{reviewers.length}</div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Doğrulanmış Hakem</span>
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold mt-2 text-emerald-600 dark:text-emerald-400">
              {verifiedCount}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Doğrulama Bekleyen</span>
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold mt-2 text-amber-600 dark:text-amber-400">
              {pendingCount}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Askıya Alınan</span>
              <Ban className="h-4 w-4 text-rose-600" />
            </div>
            <div className="text-2xl font-bold mt-2 text-rose-600 dark:text-rose-400">
              {suspendedCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviewer Table */}
      <ReviewerTable
        reviewers={reviewers as any}
        currentAdminId={session.user.id}
      />
    </div>
  )
}
