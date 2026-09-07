'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  FileText,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { publishTaskAction } from '../actions'

interface ReadyTaskItem {
  id: string
  candidateId: string
  candidateSemanticHash: string
  subjectType: string
  medicationNameTr: string | null
  conditionNameTr: string | null
  targetKey: string
  action: string
  reviewPriority: string
  requiredCapability: string
  evidenceCount: number
  sourceDocumentCount: number
  decisions: {
    reviewerName: string
    reviewerRole: string
    severity: string | null
    evidenceStrength: string | null
    approvedTargetKey: string | null
    approvedAction: string | null
    titleTr: string | null
    clinicalEffectTr: string | null
    mechanismTr: string | null
    recommendationTr: string | null
    createdAt: Date
  }[]
}

interface PublishQueueListProps {
  tasks: ReadyTaskItem[]
  canPublish: boolean
}

export function PublishQueueList({ tasks, canPublish }: PublishQueueListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [publishingTaskId, setPublishingTaskId] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handlePublish = (taskId: string) => {
    setStatusMessage(null)
    setPublishingTaskId(taskId)

    startTransition(async () => {
      const res = await publishTaskAction(taskId)
      if (!res.success) {
        setStatusMessage({ type: 'error', text: res.error ?? 'Yayınlama başarısız oldu.' })
      } else {
        setStatusMessage({
          type: 'success',
          text: `Etkileşim başarıyla yayınlandı (ID: ${res.interactionId})`,
        })
        router.refresh()
      }
      setPublishingTaskId(null)
    })
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold">Yayınlama Kuyruğu Boş</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Şu anda tüm inceleme kurallarını ve uzman konsensüsünü tamamlamış bekleyen yayınlama adayı bulunmuyor.
          Hakemler incelemeleri tamamladıkça onaylanan adaylar buraya düşecektir.
        </p>
        <div className="mt-6">
          <Link href="/clinical-review/queue">
            <Button variant="outline" size="sm">
              İnceleme Havuzuna Git
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {statusMessage && (
        <Alert variant={statusMessage.type === 'error' ? 'destructive' : 'default'} className={statusMessage.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' : ''}>
          {statusMessage.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          <AlertTitle>{statusMessage.type === 'error' ? 'Hata' : 'Başarılı'}</AlertTitle>
          <AlertDescription>{statusMessage.text}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {tasks.map((task) => {
          const primaryDecision = task.decisions[0]
          const isCurrentlyPublishing = publishingTaskId === task.id && isPending

          return (
            <Card key={task.id} className="border-border/80 shadow-sm hover:border-emerald-500/40 transition-colors">
              <CardHeader className="pb-3 border-b border-border/60 bg-muted/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-bold text-xs bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
                        {task.reviewPriority}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">{task.candidateId}</span>
                    </div>

                    <div className="text-lg font-bold uppercase text-foreground mt-1">
                      {task.medicationNameTr ?? task.conditionNameTr ?? 'Bilinmeyen'}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                      <span>{task.targetKey.replace(/_/g, ' ')}</span>
                      <span className="text-xs font-normal text-muted-foreground">({task.action})</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/clinical-review/task/${task.id}`}>
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-9">
                        <span>Adayı Aç</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>

                    {canPublish && (
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => handlePublish(task.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-1.5 shadow-sm"
                      >
                        {isCurrentlyPublishing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Yayınlanıyor...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Yayınla (Publish)</span>
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 space-y-4">
                {/* Consensus & Approvals Summary */}
                <div className="rounded-lg border border-border/70 bg-card p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Konsensüs Onayları ({task.decisions.length} Hakem)
                    </span>
                    {primaryDecision?.severity && (
                      <span className="text-muted-foreground">
                        Klinik Şiddet: <strong className="text-foreground uppercase">{primaryDecision.severity}</strong> • Kanıt:{' '}
                        <strong className="text-foreground">{primaryDecision.evidenceStrength}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                    {task.decisions.map((d, i) => (
                      <Badge key={i} variant="secondary" className="text-[11px] font-normal py-0.5">
                        {d.reviewerName} ({d.reviewerRole})
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Approved Turkish Clinical Text Preview */}
                {primaryDecision?.titleTr && (
                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold text-foreground">{primaryDecision.titleTr}</div>
                    {primaryDecision.recommendationTr && (
                      <p className="text-muted-foreground leading-relaxed italic bg-muted/30 p-2.5 rounded-md border border-border/40">
                        &ldquo;{primaryDecision.recommendationTr}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
