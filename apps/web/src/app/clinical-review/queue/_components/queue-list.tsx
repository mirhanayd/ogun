'use client'

import React from 'react'
import Link from 'next/link'
import {
  FileText,
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  HelpCircle,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TaskItem {
  id: string
  sourceSystem: string
  candidateId: string
  candidateSemanticHash: string
  subjectType: string
  medicationSubstanceId: string | null
  medicationNameTr: string | null
  conditionId: string | null
  conditionNameTr: string | null
  targetType: string
  targetKey: string
  action: string
  candidateConfidence: string
  ingredientAttribution: string | null
  reviewPriority: string
  requiredCapability: string
  status: string
  evidenceCount: number
  sourceDocumentCount: number
  version: number
  createdAt: Date
  updatedAt: Date
}

interface QueueListProps {
  tasks: TaskItem[]
  currentUserId?: string
  isVerified?: boolean
}

const PRIORITY_STYLES: Record<string, { badge: string; text: string }> = {
  P1: { badge: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', text: 'P1' },
  P2: { badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', text: 'P2' },
  P3: { badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30', text: 'P3' },
  P4: { badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30', text: 'P4' },
  P5: { badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30', text: 'P5' },
}

const STATUS_STYLES: Record<string, { label: string; badge: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: 'İnceleme Bekliyor', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', icon: Clock },
  assigned: { label: 'Atandı', badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20', icon: FileText },
  in_review: { label: 'İncelemede', badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20', icon: FileText },
  needs_more_evidence: { label: 'Kanıt Bekliyor', badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20', icon: HelpCircle },
  approved: { label: 'Onaylandı', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20', icon: CheckCircle2 },
  rejected: { label: 'Reddedildi', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20', icon: XCircle },
  deferred: { label: 'Ertelendi', badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20', icon: Clock },
  ready_to_publish: { label: 'Yayınlamaya Hazır', badge: 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40', icon: Sparkles },
  published: { label: 'Yayınlandı', badge: 'bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/30', icon: CheckCircle2 },
  source_changed: { label: 'Kaynak Değişti', badge: 'bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/30', icon: ShieldAlert },
}

const DEFAULT_PRIORITY_STYLE = { badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30', text: 'P3' }
const DEFAULT_STATUS_STYLE = { label: 'İnceleme Bekliyor', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20', icon: Clock }

function getPriorityStyle(priority: string) {
  return PRIORITY_STYLES[priority] ?? DEFAULT_PRIORITY_STYLE
}

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE
}

export function QueueList({ tasks }: QueueListProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileText className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold">Aday Bulunamadı</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Seçilen filtrelere veya arama kriterine uygun klinik inceleme görevi bulunmuyor.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Mobile Card Layout (< 768px) - Per Requirement 28 */}
      <div className="grid grid-cols-1 gap-3.5 md:hidden">
        {tasks.map((task) => {
          const pStyle = getPriorityStyle(task.reviewPriority)
          const sStyle = getStatusStyle(task.status)
          const StatusIcon = sStyle.icon
          const hasAttributionRisk =
            task.ingredientAttribution === 'multi_ingredient_unattributed' ||
            task.ingredientAttribution === 'secondary_match_uncertain'

          return (
            <Card key={task.id} className="border-border/80 shadow-sm hover:border-border transition-all">
              <CardContent className="p-4 space-y-3">
                {/* Header: Priority, Subject Type, and Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`font-bold text-xs ${pStyle.badge}`}>
                      {task.reviewPriority}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">
                      {task.subjectType === 'medication' ? 'Drug–Food' : 'Condition–Nutrient'}
                    </span>
                  </div>
                  <Badge variant="outline" className={`text-[11px] font-medium gap-1 ${sStyle.badge}`}>
                    <StatusIcon className="h-3 w-3" />
                    <span>{sStyle.label}</span>
                  </Badge>
                </div>

                {/* Candidate Core Relationship */}
                <div>
                  <div className="font-bold text-base tracking-tight text-foreground uppercase">
                    {task.medicationNameTr ?? task.conditionNameTr ?? task.medicationSubstanceId ?? 'Bilinmeyen'}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    <span>{task.targetKey.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-normal text-muted-foreground">({task.action})</span>
                  </div>
                </div>

                {/* Confidence & Attribution Metadata (Section 35: distinct visual styling) */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {/* Extraction confidence badge - muted blue/slate, NEVER red danger badge */}
                  <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300 border border-sky-500/20">
                    Çıkarım: {task.candidateConfidence.toUpperCase()}
                  </span>

                  {/* Attribution badge */}
                  {hasAttributionRisk ? (
                    <span className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300 border border-amber-500/20">
                      <AlertTriangle className="h-3 w-3" />
                      Çoklu Etken Madde (Çift Hakem)
                    </span>
                  ) : (
                    <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Tek Etken Madde
                    </span>
                  )}
                </div>

                {/* Evidence & SPL Metrics + CTA Button */}
                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>
                      <strong className="text-foreground font-semibold">{task.evidenceCount}</strong> kanıt
                    </span>
                    <span>•</span>
                    <span>
                      <strong className="text-foreground font-semibold">{task.sourceDocumentCount}</strong> SPL etiket
                    </span>
                  </div>

                  <Link href={`/clinical-review/task/${task.id}`}>
                    <Button
                      size="sm"
                      className="h-9 min-w-[76px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs gap-1"
                    >
                      <span>İncele</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Desktop & Tablet Table Layout (>= 768px) */}
      <div className="hidden md:block rounded-lg border border-border/80 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
              <TableHead className="w-[80px]">Öncelik</TableHead>
              <TableHead className="min-w-[180px]">İlaç / Konu</TableHead>
              <TableHead className="min-w-[180px]">Hedef ve Eylem</TableHead>
              <TableHead className="w-[120px]">Çıkarım Güveni</TableHead>
              <TableHead className="w-[140px]">Atıf Güvenliği</TableHead>
              <TableHead className="w-[110px] text-right">Kanıt / SPL</TableHead>
              <TableHead className="w-[140px]">Durum</TableHead>
              <TableHead className="w-[100px] text-right">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const pStyle = getPriorityStyle(task.reviewPriority)
              const sStyle = getStatusStyle(task.status)
              const StatusIcon = sStyle.icon
              const hasAttributionRisk =
                task.ingredientAttribution === 'multi_ingredient_unattributed' ||
                task.ingredientAttribution === 'secondary_match_uncertain'

              return (
                <TableRow key={task.id} className="hover:bg-muted/30 transition-colors">
                  {/* Priority Badge */}
                  <TableCell>
                    <Badge variant="outline" className={`font-bold text-xs ${pStyle.badge}`}>
                      {task.reviewPriority}
                    </Badge>
                  </TableCell>

                  {/* Subject */}
                  <TableCell>
                    <div className="font-semibold text-sm text-foreground">
                      {task.medicationNameTr ?? task.conditionNameTr ?? task.medicationSubstanceId ?? 'Bilinmeyen'}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {task.candidateId}
                    </div>
                  </TableCell>

                  {/* Target & Action */}
                  <TableCell>
                    <div className="font-medium text-sm text-foreground capitalize">
                      {task.targetKey.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Eylem: <span className="font-mono text-[11px]">{task.action}</span>
                    </div>
                  </TableCell>

                  {/* Confidence (Section 35: distinct visual styling from severity) */}
                  <TableCell>
                    <span className="inline-block rounded bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300 border border-sky-500/20">
                      {task.candidateConfidence.toUpperCase()}
                    </span>
                  </TableCell>

                  {/* Attribution Risk */}
                  <TableCell>
                    {hasAttributionRisk ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-500/20">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Çoklu Etken</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Tekil Doğrudan</span>
                    )}
                  </TableCell>

                  {/* Evidence & SPL counts */}
                  <TableCell className="text-right">
                    <div className="text-sm font-semibold text-foreground">{task.evidenceCount}</div>
                    <div className="text-[11px] text-muted-foreground">{task.sourceDocumentCount} SPL</div>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell>
                    <Badge variant="outline" className={`text-xs font-medium gap-1 ${sStyle.badge}`}>
                      <StatusIcon className="h-3 w-3" />
                      <span>{sStyle.label}</span>
                    </Badge>
                  </TableCell>

                  {/* Action Link */}
                  <TableCell className="text-right">
                    <Link href={`/clinical-review/task/${task.id}`}>
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3"
                      >
                        İncele
                      </Button>
                    </Link>
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
