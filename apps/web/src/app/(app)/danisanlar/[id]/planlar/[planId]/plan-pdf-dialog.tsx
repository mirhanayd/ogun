'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Download, FileDown, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PdfDensity } from '@ogun/db/schema'
import type { PdfPlanData } from '@ogun/pdf'
import { getPlanPdfDataAction, generateAndSavePlanPdfAction } from './pdf-actions'

// GitHub issue #35 / Prompt 6.1 — GÖREV: "önizleme/PDF butonu" — #25'in
// bıraktığı, apps/web/src/app/(app)/danisanlar/[id]/planlar/[planId]/
// plan-editor.tsx'teki disabled "PDF önizleme / Yakında" düğmesini GERÇEK
// bir diyaloğa bağlıyor. Bu bileşen SADECE kabuk (diyalog, şablon
// seçenekleri, indirme akışı) — gerçek react-pdf render'ı (browser-only
// API'lere dayandığı için) next/dynamic(ssr:false) ile YÜKLENEN
// pdf-preview-body.tsx'te.
const PdfPreviewBody = dynamic(() => import('./pdf-preview-body').then((m) => m.PdfPreviewBody), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Önizleyici yükleniyor…
    </div>
  ),
})

export function PlanPdfDialog({
  open,
  onOpenChange,
  planId,
  clientId,
  defaultDensity,
  defaultShowCalories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  clientId: string
  defaultDensity: PdfDensity
  defaultShowCalories: boolean
}) {
  const [density, setDensity] = useState<PdfDensity>(defaultDensity)
  const [showCalories, setShowCalories] = useState(defaultShowCalories)
  const [includeNutrientSummaryPage, setIncludeNutrientSummaryPage] = useState(false)

  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [pdfData, setPdfData] = useState<PdfPlanData | null>(null)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('loading')
    setPdfData(null)
    getPlanPdfDataAction(planId, { density, showCalories, includeNutrientSummaryPage })
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.data) {
          setErrorMessage(result.error ?? 'PDF verisi hazırlanamadı.')
          setStatus('error')
          return
        }
        setPdfData(result.data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('PDF verisi hazırlanamadı.')
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, planId, density, showCalories, includeNutrientSummaryPage])

  async function handleDownload() {
    setSaving(true)
    setErrorMessage(null)
    try {
      const result = await generateAndSavePlanPdfAction(planId, clientId, {
        density,
        showCalories,
        includeNutrientSummaryPage,
      })
      if (!result.success || !result.data) {
        setErrorMessage(result.error ?? 'PDF üretilemedi.')
        return
      }
      // GÖREV: sunucu tarafı üretim + documents'a kayıt (#19'un depolama
      // akışı) — indirme, o kaydedilen dosyanın presigned URL'i üzerinden
      // (bkz. pdf-actions.ts generateAndSavePlanPdfAction), istemcideki
      // önizleme blob'undan DEĞİL — böylece "indirilen dosya" ile "danışan
      // dosyaları sekmesinde görünen dosya" HER ZAMAN birebir aynı olur.
      window.open(result.data.downloadUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="size-4" />
            Diyet planı PDF&apos;i
          </DialogTitle>
          <DialogDescription>
            Danışana verilecek çıktının önizlemesi — düzen seçeneklerini değiştirdikçe önizleme
            güncellenir. &ldquo;İndir&rdquo; hem dosyayı üretir hem danışanın belge geçmişine kaydeder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4 border-y border-border py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Yoğunluk</span>
            <Select value={density} onValueChange={(v) => setDensity(v as PdfDensity)}>
              <SelectTrigger className="h-7 w-auto text-xs" aria-label="Yoğunluk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spacious">Geniş</SelectItem>
                <SelectItem value="compact">Kompakt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={showCalories} onCheckedChange={(v) => setShowCalories(v === true)} />
            Kalori göster
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox
              checked={includeNutrientSummaryPage}
              onCheckedChange={(v) => setIncludeNutrientSummaryPage(v === true)}
            />
            Besin öğesi özeti sayfası ekle
          </label>
          {pdfData?.layout.format === 'değişim_listesi' && (
            <Badge variant="outline" className="text-[0.65rem]">
              Değişim listesi formatı — sonda eşdeğerler tablosu eklenecek
            </Badge>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {status === 'loading' && (
            <div className="flex h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Plan verisi hazırlanıyor…
            </div>
          )}
          {status === 'error' && (
            <div className="flex h-[60vh] items-center justify-center text-sm text-destructive">
              {errorMessage ?? 'Bir hata oluştu.'}
            </div>
          )}
          {status === 'ready' && pdfData && (
            <div className="h-[60vh]">
              <PdfPreviewBody data={pdfData} onBlobReady={setPdfBlob} />
            </div>
          )}
        </div>

        <DialogFooter>
          {errorMessage && status !== 'error' && <p className="mr-auto text-xs text-destructive">{errorMessage}</p>}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={saving || status !== 'ready' || !pdfBlob}
            onClick={handleDownload}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            İndir ve kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
