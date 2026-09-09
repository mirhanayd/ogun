import React from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import {
  getClinicalReviewDecisions,
  getClinicalReviewTaskById,
  getTaskAssignments,
  getUserDecisionForTask,
} from '@ogun/db/queries'
import { createClinicalReviewArtifactStore } from '@ogun/etl/clinical-review-artifact-store'
import { requireVerifiedReviewer } from '@/lib/clinical-review/authz'
import { EvidencePanel } from './_components/evidence-panel'
import { TechnicalQaPanel } from './_components/technical-qa-panel'
import { DecisionForm } from './_components/decision-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ChevronRight, AlertTriangle, User, Users } from 'lucide-react'

interface TaskPageProps {
  params: Promise<{ id: string }>
}

const PRIORITY_BADGES: Record<string, string> = {
  P1: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  P2: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  P3: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  P4: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30',
  P5: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'İnceleme Bekliyor',
  assigned: 'Atandı',
  in_review: 'İncelemede',
  needs_more_evidence: 'Kanıt Bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  deferred: 'Ertelendi',
  ready_to_publish: 'Yayınlamaya Hazır',
  published: 'Yayınlandı',
  source_changed: 'Kaynak Değişti',
}

export default async function ClinicalReviewTaskPage({ params }: TaskPageProps) {
  const session = await requireVerifiedReviewer()
  const { id: taskId } = await params

  const task = await getClinicalReviewTaskById(db, taskId)
  if (!task) {
    notFound()
  }

  const [assignments, decisions, userDraft] = await Promise.all([
    getTaskAssignments(db, task.id),
    getClinicalReviewDecisions(db, task.id, false),
    getUserDecisionForTask(db, task.id, session.user.id, true),
  ])
  const isAssigned = assignments.some(
    (assignment) =>
      assignment.reviewerUserId === session.user.id &&
      ['assigned', 'in_progress', 'completed'].includes(assignment.status),
  )
  if (!isAssigned && session.profile.professionalRole !== 'clinical_admin') notFound()

  // Fetch candidate detail and evidence from artifact store
  const artifactStore = createClinicalReviewArtifactStore()
  const bundle = await artifactStore.getCandidateDetail(
    task.candidateId,
    task.candidateSemanticHash,
  )

  const evidenceAvailable = bundle !== null
  const isVerifiedReviewer =
    session.profile.verificationStatus === 'verified' && session.profile.isActive

  const hasAttributionRisk =
    task.ingredientAttribution === 'multi_ingredient_unattributed' ||
    task.ingredientAttribution === 'secondary_match_uncertain'

  // Determine displayed clinical severity (Section 34 & 35: NOT ASSESSED until reviewed)
  const approvedDecision = decisions.find((d) => d.decision === 'approve' && d.severity)
  const displayedClinicalSeverity = approvedDecision?.severity ?? 'Not assessed'
  const displayedEvidenceStrength = approvedDecision?.evidenceStrength ?? 'Not assessed'

  const sectionCounts = new Map<string, number>()
  for (const ev of bundle?.evidenceList ?? []) {
    const sec = ev.matchedSection || 'DRUG INTERACTIONS'
    sectionCounts.set(sec, (sectionCounts.get(sec) ?? 0) + 1)
  }
  const topSections = Array.from(sectionCounts.entries())
    .map(([sectionName, count]) => ({ sectionName, count }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Navigation */}
      <div className="flex items-center justify-between gap-2 border-b border-border/80 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/clinical-review/queue"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Havuz</span>
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-mono">{task.candidateId}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground font-mono">v{task.version}</span>
          <Badge variant="outline" className="text-xs">
            {STATUS_LABELS[task.status] ?? task.status}
          </Badge>
        </div>
      </div>

      {/* Source Changed (Stale Snapshot) Warning Banner (Section 8 & 50) */}
      {task.status === 'source_changed' && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-950 dark:text-rose-200">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <span>Kaynak Veri Değişti (Stale Snapshot)</span>
          </div>
          <p className="text-xs text-rose-800 dark:text-rose-300 mt-1">
            Bu adayın openFDA kaynak özeti ve semantik karması değişmiştir. Önceki onaylar
            geçersizdir ve yeniden inceleme gereklidir.
          </p>
        </div>
      )}

      {/* Task Primary Header Card */}
      <Card className="border-border/80 shadow-sm overflow-hidden">
        <div className="bg-muted/40 p-4 sm:p-6 border-b border-border/60">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`font-bold text-xs ${PRIORITY_BADGES[task.reviewPriority] ?? ''}`}
                >
                  {task.reviewPriority}
                </Badge>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {task.subjectType === 'medication'
                    ? 'Drug–Food Interaction'
                    : 'Condition–Nutrient Interaction'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground uppercase mt-2">
                {task.medicationNameTr ??
                  task.conditionNameTr ??
                  task.medicationSubstanceId ??
                  'Bilinmeyen'}
              </h1>
              <div className="flex items-center gap-2 text-base font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                <span>→</span>
                <span>{task.targetKey.replace(/_/g, ' ')}</span>
                <span className="text-xs font-normal text-muted-foreground font-mono">
                  ({task.action})
                </span>
              </div>
            </div>

            {/* Assessment Separation Block (Sections 34, 35, 36) */}
            <div className="grid grid-cols-3 gap-2.5 bg-background p-3 rounded-xl border border-border/80 text-center shrink-0">
              {/* Extraction Confidence - NEVER red badge */}
              <div className="space-y-0.5 px-2">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block">
                  Çıkarım Güveni
                </span>
                <Badge
                  variant="secondary"
                  className="text-xs font-bold bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20"
                >
                  {task.candidateConfidence.toUpperCase()}
                </Badge>
              </div>

              {/* Clinical Severity - NOT ASSESSED until human review */}
              <div className="space-y-0.5 px-2 border-x border-border/60">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block">
                  Klinik Şiddet
                </span>
                <span
                  className={`text-xs font-bold ${
                    displayedClinicalSeverity === 'Not assessed'
                      ? 'text-muted-foreground italic'
                      : 'text-foreground uppercase'
                  }`}
                >
                  {displayedClinicalSeverity}
                </span>
              </div>

              {/* Evidence Strength - NOT ASSESSED until human review */}
              <div className="space-y-0.5 px-2">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block">
                  Kanıt Gücü
                </span>
                <span
                  className={`text-xs font-bold ${
                    displayedEvidenceStrength === 'Not assessed'
                      ? 'text-muted-foreground italic'
                      : 'text-foreground uppercase'
                  }`}
                >
                  {displayedEvidenceStrength}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Attribution & Meta Strip */}
        <div className="p-4 bg-background flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground">
              Aday ID: <strong className="font-mono text-foreground">{task.candidateId}</strong>
            </span>
            <span>•</span>
            <span className="text-muted-foreground">
              Semantik Hash:{' '}
              <strong className="font-mono text-foreground">
                {task.candidateSemanticHash.slice(0, 12)}...
              </strong>
            </span>
            <span>•</span>
            <span className="text-muted-foreground">
              Gerekli Yetkinlik:{' '}
              <strong className="text-foreground">{task.requiredCapability}</strong>
            </span>
          </div>

          <div>
            {hasAttributionRisk ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="h-3 w-3" />
                <span>Çoklu Etken Madde (Çift Hakem Onayı Zorunlu)</span>
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Tekil Etken Madde Doğrudan Eşleşme
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Two Column Layout on Desktop: Evidence/QA on left, Review Form on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Evidence & Technical QA */}
        <div className="lg:col-span-7 space-y-6">
          {/* Technical Pre-Review / QA Panel (Section 38) */}
          <TechnicalQaPanel
            technicalReview={
              bundle?.technicalPreReview
                ? {
                    technicalRecommendation: `Önerilen Öncelik: ${bundle.technicalPreReview.suggestedReviewPriority}, Çözümleme Durumu: ${bundle.technicalPreReview.targetResolutionStatus}`,
                    scopeWarning: bundle.technicalPreReview.scopeWarning,
                    suggestedCorrectedTarget: bundle.technicalPreReview.suggestedTargetKey,
                    attributionWarning: bundle.technicalPreReview.attributionWarning,
                  }
                : null
            }
            ingredientAttribution={task.ingredientAttribution}
            candidateConfidence={task.candidateConfidence}
          />

          {/* Evidence Panel (Section 37) */}
          <EvidencePanel
            evidenceList={bundle?.evidenceList ?? []}
            totalCount={task.evidenceCount}
            documentCount={task.sourceDocumentCount}
            topSections={topSections}
          />
        </div>

        {/* Right Column (5 cols): Review Form & Previous Decisions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Decision Form Component */}
          <DecisionForm
            taskId={task.id}
            taskVersion={task.version}
            targetKey={task.targetKey}
            action={task.action}
            hasAttributionRisk={hasAttributionRisk}
            isVerifiedReviewer={isVerifiedReviewer}
            evidenceAvailable={evidenceAvailable}
            existingDraft={userDraft}
          />

          {/* Past Decisions & Review History Card */}
          {decisions.length > 0 && (
            <Card className="border-border/80 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">
                    Kayıtlı Hakem Kararları ({decisions.length})
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {decisions.map((dec) => (
                  <div
                    key={dec.id}
                    className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <User className="h-3.5 w-3.5" />
                        <span>{dec.reviewerName}</span>
                        <span className="text-[11px] font-normal text-muted-foreground capitalize">
                          ({dec.reviewerRole})
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold uppercase ${
                          dec.decision === 'approve'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                            : dec.decision === 'reject'
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20'
                              : 'bg-muted'
                        }`}
                      >
                        {dec.decision}
                      </Badge>
                    </div>

                    {dec.severity && (
                      <div className="text-muted-foreground">
                        Şiddet:{' '}
                        <strong className="text-foreground uppercase">{dec.severity}</strong> •
                        Kanıt: <strong className="text-foreground">{dec.evidenceStrength}</strong>
                      </div>
                    )}

                    {dec.reviewNote && (
                      <div className="text-muted-foreground italic border-t border-border/40 pt-1 mt-1">
                        &ldquo;{dec.reviewNote}&rdquo;
                      </div>
                    )}

                    <div className="text-[10px] text-muted-foreground/70">
                      {new Date(dec.createdAt).toLocaleString('tr-TR')}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Assigned Reviewers Info Card */}
          {assignments.length > 0 && (
            <Card className="border-border/80 bg-muted/10 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
                  Atanmış Hakemler
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2 text-xs">
                {assignments.map((asg) => (
                  <div key={asg.id} className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {asg.reviewerName} ({asg.reviewerRole})
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {asg.assignmentRole}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
