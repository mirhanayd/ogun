import React from 'react'
import {
  Wrench,
  AlertTriangle,
  Info,
  CheckCircle2,
  GitMerge,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface TechnicalQaPanelProps {
  technicalReview?: {
    technicalRecommendation?: string | null
    scopeWarning?: string | null
    suggestedCorrectedTarget?: string | null
    suggestedCorrectedAction?: string | null
    duplicateMergeWarning?: string | null
    attributionWarning?: string | null
  } | null
  ingredientAttribution?: string | null
  candidateConfidence?: string
}

export function TechnicalQaPanel({
  technicalReview,
  ingredientAttribution,
}: TechnicalQaPanelProps) {
  const hasAttributionRisk =
    ingredientAttribution === 'multi_ingredient_unattributed' ||
    ingredientAttribution === 'secondary_match_uncertain'

  const hasContent =
    Boolean(technicalReview) || hasAttributionRisk

  if (!hasContent) return null

  return (
    <Card className="border-border/80 bg-muted/20 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Teknik Ön İnceleme & Çıkarım QA</CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Algoritmik çıkarım kalitesi, kapsam uyarıları ve etken madde atıf analizi (İnsan onayı yerine geçmez)
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono uppercase bg-background">
            Extraction QA
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3 text-xs">
        {/* Attribution Risk Warning */}
        {hasAttributionRisk && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-semibold">Çoklu Etken Madde Atıf Riski (Dual-Review Gerekli):</span>
              <p className="mt-0.5 opacity-90 leading-relaxed">
                İlaç etiketi birden fazla etken madde içermekte veya atıf belirsizliği barındırmaktadır. Onay için
                en az iki bağımsız hakem incelemesi ve açık etken madde onayı (Attribution Confirmation) zorunludur.
              </p>
            </div>
          </div>
        )}

        {/* Technical Recommendations if present */}
        {technicalReview?.technicalRecommendation && (
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
            <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Teknik Değerlendirme Önerisi:</span>
              <p className="mt-0.5 text-muted-foreground leading-relaxed">
                {technicalReview.technicalRecommendation}
              </p>
            </div>
          </div>
        )}

        {/* Corrected Target/Action suggestions */}
        {(technicalReview?.suggestedCorrectedTarget || technicalReview?.suggestedCorrectedAction) && (
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Önerilen Hedef / Eylem Düzeltmesi:</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {technicalReview.suggestedCorrectedTarget && (
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                    Hedef: {technicalReview.suggestedCorrectedTarget}
                  </span>
                )}
                {technicalReview.suggestedCorrectedAction && (
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                    Eylem: {technicalReview.suggestedCorrectedAction}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Duplicate / Merge Warning */}
        {technicalReview?.duplicateMergeWarning && (
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
            <GitMerge className="h-4 w-4 shrink-0 text-purple-500 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Tekilleştirme / Birleştirme Notu:</span>
              <p className="mt-0.5 text-muted-foreground leading-relaxed">
                {technicalReview.duplicateMergeWarning}
              </p>
            </div>
          </div>
        )}

        {/* Scope Warning */}
        {technicalReview?.scopeWarning && (
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Kapsam Uyarısı (Scope Warning):</span>
              <p className="mt-0.5 text-muted-foreground leading-relaxed">
                {technicalReview.scopeWarning}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
