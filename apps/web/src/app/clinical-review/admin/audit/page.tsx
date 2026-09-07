import React from 'react'
import Link from 'next/link'
import { db } from '@ogun/db'
import { getClinicalReviewAuditLogs } from '@ogun/db/queries'
import { requireClinicalAdmin } from '@/lib/clinical-review/authz'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  History,
  User,
  ArrowRight,
  ExternalLink,
  Lock,
} from 'lucide-react'

const EVENT_BADGES: Record<string, { label: string; badge: string }> = {
  task_created: { label: 'Görev Yaratıldı', badge: 'bg-muted text-muted-foreground' },
  task_assigned: { label: 'Görev Atandı', badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
  review_started: { label: 'İnceleme Başladı', badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20' },
  decision_saved: { label: 'Karar Kaydedildi', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  decision_changed: { label: 'Karar Değişti', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  needs_evidence: { label: 'Kanıt İstendi', badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20' },
  approval_completed: { label: 'Onay Tamamlandı', badge: 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30' },
  source_changed: { label: 'Kaynak Değişti', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
  ready_to_publish: { label: 'Yayınlamaya Hazır', badge: 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40' },
  published: { label: 'Yayınlandı (Prod)', badge: 'bg-teal-500/20 text-teal-800 dark:text-teal-300 border-teal-500/40' },
  reviewer_verified: { label: 'Hakem Doğrulandı', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  reviewer_suspended: { label: 'Hakem Askıya Alındı', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' },
}

export default async function ClinicalReviewAdminAuditPage() {
  await requireClinicalAdmin()

  const auditLogs = await getClinicalReviewAuditLogs(db, { limit: 100 })

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
            <History className="h-5 w-5 text-emerald-600" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Klinik Denetim İzi (Audit Log)
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Eklemeli (append-only) güvenli denetim kaydı. Tüm hakem kararları, durum geçişleri ve yayınlama olayları mühürlenir.
          </p>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-md border border-border">
          <Lock className="h-3.5 w-3.5" />
          <span>Değiştirilemez / Append-Only</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-lg border border-border/80 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
              <TableHead className="w-[160px]">Zaman Damgası</TableHead>
              <TableHead className="w-[160px]">Olay Tipi</TableHead>
              <TableHead className="w-[160px]">İşlemi Yapan (Actor)</TableHead>
              <TableHead className="w-[140px]">Görev / Aday</TableHead>
              <TableHead className="w-[140px]">Durum Geçişi</TableHead>
              <TableHead className="min-w-[240px]">Değişiklik Özeti</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {auditLogs.map((log) => {
              const eventInfo = EVENT_BADGES[log.eventType] ?? {
                label: log.eventType,
                badge: 'bg-muted text-muted-foreground',
              }

              return (
                <TableRow key={log.id} className="hover:bg-muted/30 transition-colors text-xs">
                  {/* Timestamp */}
                  <TableCell className="font-mono text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString('tr-TR')}
                  </TableCell>

                  {/* Event Type */}
                  <TableCell>
                    <Badge variant="outline" className={`text-[11px] font-medium ${eventInfo.badge}`}>
                      {eventInfo.label}
                    </Badge>
                  </TableCell>

                  {/* Actor User */}
                  <TableCell>
                    <div className="font-medium text-foreground flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span>{log.actorName}</span>
                    </div>
                  </TableCell>

                  {/* Task ID Link */}
                  <TableCell>
                    {log.taskId ? (
                      <Link
                        href={`/clinical-review/task/${log.taskId}`}
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        <span>{log.taskId.slice(0, 10)}...</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[11px]">-</span>
                    )}
                  </TableCell>

                  {/* Status Transition */}
                  <TableCell>
                    {log.fromStatus || log.toStatus ? (
                      <div className="flex items-center gap-1 font-mono text-[11px]">
                        <span className="text-muted-foreground">{log.fromStatus ?? '-'}</span>
                        <ArrowRight className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-foreground">{log.toStatus ?? '-'}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Summary */}
                  <TableCell className="text-foreground leading-relaxed break-words">
                    {log.compactChangeSummary}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
