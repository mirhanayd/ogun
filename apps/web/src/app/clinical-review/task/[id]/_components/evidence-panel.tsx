'use client'

import React, { useState } from 'react'
import {
  FileText,
  ExternalLink,
  ChevronDown,
  Layers,
  Calendar,
  Compass,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface EvidenceItem {
  id: string
  splSetId?: string | null
  effectiveTime?: string | null
  matchedSection?: string | null
  evidenceSnippet: string
  confidence?: string | null
  sourceSystem?: string | null
  labelPartitionFile?: string | null
  recordHash?: string | null
}

interface EvidencePanelProps {
  evidenceList: EvidenceItem[]
  totalCount: number
  documentCount: number
  topSections?: { sectionName: string; count: number }[]
}

export function EvidencePanel({
  evidenceList,
  totalCount,
  documentCount,
  topSections = [],
}: EvidencePanelProps) {
  const [visibleCount, setVisibleCount] = useState(5)

  const displayedList = evidenceList.slice(0, visibleCount)
  const hasMore = visibleCount < evidenceList.length

  const handleShowMore = () => {
    setVisibleCount((prev) => Math.min(prev + 10, evidenceList.length))
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Kaynak Kanıtları (FDA SPL Evidence)</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Toplam <strong className="text-foreground">{totalCount}</strong> kanıt alıntısı,{' '}
                <strong className="text-foreground">{documentCount}</strong> onaylı FDA ürün etiketinden çıkarılmıştır.
              </p>
            </div>
          </div>

          {topSections.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {topSections.slice(0, 3).map((sec) => (
                <Badge key={sec.sectionName} variant="outline" className="text-[10px] font-medium py-0">
                  {sec.sectionName} ({sec.count})
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-4">
        {evidenceList.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Aday için kanıt verisi bulunamadı veya kanıt deposundan okunamadı.
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {displayedList.map((item, idx) => {
                const dailyMedUrl = item.splSetId
                  ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${item.splSetId}`
                  : null

                return (
                  <div
                    key={item.id || idx}
                    className="rounded-lg border border-border/70 bg-card p-3.5 sm:p-4 space-y-2 hover:border-border transition-colors"
                  >
                    {/* Top row: SPL Section & DailyMed Link */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-semibold text-[11px] bg-muted">
                          {item.matchedSection || 'DRUG INTERACTIONS'}
                        </Badge>
                        {item.effectiveTime && (
                          <span className="flex items-center gap-1 text-muted-foreground text-[11px]">
                            <Calendar className="h-3 w-3" />
                            {item.effectiveTime}
                          </span>
                        )}
                      </div>

                      {dailyMedUrl && (
                        <a
                          href={dailyMedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          <span>DailyMed SPL</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>

                    {/* Sentence text (Requirement 54: long FDA snippets wrap) */}
                    <div className="text-sm font-medium leading-relaxed text-foreground break-words">
                      &ldquo;{item.evidenceSnippet}&rdquo;
                    </div>

                    {/* Record hash or partition file locator */}
                    {(item.labelPartitionFile || item.recordHash) && (
                      <div className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground break-words">
                        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/80">
                          <Compass className="h-2.5 w-2.5" />
                          {item.labelPartitionFile ? `File: ${item.labelPartitionFile}` : `Hash: ${item.recordHash}`}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Show More Evidence Button (Section 37: lazy-load / pagination) */}
            {hasMore && (
              <div className="pt-2 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShowMore}
                  className="gap-1.5 text-xs h-9 px-4"
                >
                  <ChevronDown className="h-4 w-4" />
                  <span>
                    Daha Fazla Kanıt Göster ({evidenceList.length - visibleCount} kalan)
                  </span>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
