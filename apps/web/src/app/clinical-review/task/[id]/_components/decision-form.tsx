'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Save,
  AlertTriangle,
  Loader2,
  AlertCircle,
  ShieldCheck,
  FileEdit,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { submitReviewDecisionAction, saveDraftDecisionAction } from '../actions'

interface DecisionFormProps {
  taskId: string
  taskVersion: number
  targetKey: string
  action: string
  hasAttributionRisk: boolean
  isVerifiedReviewer: boolean
  evidenceAvailable: boolean
  existingDraft?: {
    decision: string
    severity: string | null
    evidenceStrength: string | null
    approvedTargetKey: string | null
    approvedAction: string | null
    titleTr: string | null
    clinicalEffectTr: string | null
    mechanismTr: string | null
    recommendationTr: string | null
    attributionConfirmed: boolean | null
    rejectReason: string | null
    reviewNote: string | null
  } | null
}

const SEVERITY_LEVELS = [
  { value: 'info', label: 'Bilgi (Info)', desc: 'Klinik açıdan minimal risk, bilgilendirme amaçlı etkileşim.' },
  { value: 'low', label: 'Düşük (Low)', desc: 'Hafif klinik etki, rutin takip yeterli.' },
  { value: 'moderate', label: 'Orta (Moderate)', desc: 'Doz ayarlaması veya zamanlama düzenlemesi gerektirebilir.' },
  { value: 'high', label: 'Yüksek (High - Çift Hakem)', desc: 'Önemli klinik risk, kombinasyondan kaçınılmalı veya yakın izlem gerekir.' },
  { value: 'critical', label: 'Kritik (Critical - Çift Hakem)', desc: 'Kontrendike veya hayati tehlike oluşturan etkileşim.' },
]

const EVIDENCE_STRENGTHS = [
  { value: 'strong', label: 'Güçlü (Strong)', desc: 'İyi tasarlanmış klinik çalışmalar veya çoklu FDA etiket onayı.' },
  { value: 'moderate', label: 'Orta (Moderate)', desc: 'Tutarlı vaka serileri, farmakokinetik çalışmalar veya tekil SPL.' },
  { value: 'limited', label: 'Sınırlı (Limited)', desc: 'Sınırlı vaka bildirimleri veya zayıf farmakolojik kanıt.' },
  { value: 'expert_consensus', label: 'Uzman Konsensüsü (Expert Consensus)', desc: 'Rehber veya uzman komite görüşü.' },
  { value: 'unknown', label: 'Belirsiz (Unknown)', desc: 'Yetersiz veya çelişkili veri.' },
]

const REJECT_REASONS = [
  { value: 'false_positive', label: 'Yanlış Pozitif (False Positive NLP Extraction)' },
  { value: 'wrong_subject', label: 'Hatalı İlaç / Etken Madde Eşleşmesi' },
  { value: 'wrong_target', label: 'Hatalı Besin / Takviye Hedefi' },
  { value: 'wrong_action', label: 'Hatalı Eylem / Yön (Artırır/Azaltır Karışıklığı)' },
  { value: 'non_clinical_instruction', label: 'Klinik Dışı Metin / Prosedürel İfade' },
  { value: 'duplicate', label: 'Mükerrer / Birleştirilecek Aday' },
  { value: 'source_problem', label: 'Kaynak Metin Hatası veya Eksikliği' },
  { value: 'other', label: 'Diğer (Açıklama Zorunlu)' },
]

export function DecisionForm({
  taskId,
  taskVersion,
  targetKey,
  action,
  hasAttributionRisk,
  isVerifiedReviewer,
  evidenceAvailable,
  existingDraft,
}: DecisionFormProps) {
  const router = useRouter()
  const [isSubmitting, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Form State
  const [decision, setDecision] = useState<'approve' | 'reject' | 'defer' | 'needs_more_evidence'>(
    (existingDraft?.decision as any) ?? 'approve',
  )
  const [severity, setSeverity] = useState<string>(existingDraft?.severity ?? '')
  const [evidenceStrength, setEvidenceStrength] = useState<string>(existingDraft?.evidenceStrength ?? '')
  const [approvedTargetKey, setApprovedTargetKey] = useState<string>(existingDraft?.approvedTargetKey ?? targetKey)
  const [approvedAction, setApprovedAction] = useState<string>(existingDraft?.approvedAction ?? action)
  const [titleTr, setTitleTr] = useState<string>(existingDraft?.titleTr ?? '')
  const [clinicalEffectTr, setClinicalEffectTr] = useState<string>(existingDraft?.clinicalEffectTr ?? '')
  const [mechanismTr, setMechanismTr] = useState<string>(existingDraft?.mechanismTr ?? '')
  const [recommendationTr, setRecommendationTr] = useState<string>(existingDraft?.recommendationTr ?? '')
  const [attributionConfirmed, setAttributionConfirmed] = useState<boolean>(
    existingDraft?.attributionConfirmed ?? false,
  )
  const [rejectReason, setRejectReason] = useState<string>(existingDraft?.rejectReason ?? '')
  const [reviewNote, setReviewNote] = useState<string>(existingDraft?.reviewNote ?? '')

  const buildFormData = () => {
    const fd = new FormData()
    fd.set('decision', decision)
    if (severity) fd.set('severity', severity)
    if (evidenceStrength) fd.set('evidenceStrength', evidenceStrength)
    if (approvedTargetKey) fd.set('approvedTargetKey', approvedTargetKey)
    if (approvedAction) fd.set('approvedAction', approvedAction)
    if (titleTr) fd.set('titleTr', titleTr)
    if (clinicalEffectTr) fd.set('clinicalEffectTr', clinicalEffectTr)
    if (mechanismTr) fd.set('mechanismTr', mechanismTr)
    if (recommendationTr) fd.set('recommendationTr', recommendationTr)
    if (attributionConfirmed) fd.set('attributionConfirmed', 'true')
    if (rejectReason) fd.set('rejectReason', rejectReason)
    if (reviewNote) fd.set('reviewNote', reviewNote)
    return fd
  }

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    // Client-side quick checks
    if (decision === 'approve') {
      if (!severity) {
        setErrorMessage('Lütfen bir klinik şiddet derecesi (Severity) seçin.')
        return
      }
      if (!evidenceStrength) {
        setErrorMessage('Lütfen bir kanıt gücü (Evidence Strength) seçin.')
        return
      }
      if (hasAttributionRisk && !attributionConfirmed) {
        setErrorMessage('Çoklu etken madde atıf onayını işaretlemeniz zorunludur.')
        return
      }
    } else if (decision === 'reject') {
      if (!rejectReason) {
        setErrorMessage('Lütfen ret gerekçesi seçin.')
        return
      }
      if (!reviewNote.trim()) {
        setErrorMessage('Ret gerekçesini açıklayan bir inceleme notu zorunludur.')
        return
      }
    } else if (decision === 'needs_more_evidence') {
      if (!reviewNote.trim()) {
        setErrorMessage('Gereken ek kanıt veya araştırmayı açıklayan not zorunludur.')
        return
      }
    }

    startTransition(async () => {
      const fd = buildFormData()
      const result = await submitReviewDecisionAction(taskId, taskVersion, fd)
      if (!result.success) {
        setErrorMessage(result.error ?? 'Karar kaydedilemedi.')
      } else {
        setSuccessMessage('Klinik kararınız başarıyla kaydedildi.')
        router.refresh()
      }
    })
  }

  const handleSaveDraft = () => {
    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const fd = buildFormData()
      const result = await saveDraftDecisionAction(taskId, taskVersion, fd)
      if (!result.success) {
        setErrorMessage(result.error ?? 'Taslak kaydedilemedi.')
      } else {
        setSuccessMessage('İnceleme taslağınız kaydedildi.')
      }
    })
  }

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-4 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-600">
              <FileEdit className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Uzman Klinik Karar Formu</CardTitle>
              <CardDescription className="text-xs">
                Klinik onay, ret veya erteleme kararınızı girin. Kimliğiniz ve inceleme zamanı sunucu tarafından güvenli olarak mühürlenecektir.
              </CardDescription>
            </div>
          </div>
          {existingDraft && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20">
              Taslak Mevcut
            </Badge>
          )}
        </div>
      </CardHeader>

      <form onSubmit={handleFinalSubmit}>
        <CardContent className="p-4 sm:p-6 space-y-6">
          {/* Fail-closed warning if artifact store is down */}
          {!evidenceAvailable && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Kanıt Deposu Erişilemiyor (Fail-Closed)</AlertTitle>
              <AlertDescription>
                Kaynak kanıtlar doğrulanamadığı için bu aday üzerinde karar girişi geçici olarak kilitlenmiştir.
              </AlertDescription>
            </Alert>
          )}

          {/* Verification warning if reviewer is not verified */}
          {!isVerifiedReviewer && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Doğrulanmamış Hakem</AlertTitle>
              <AlertDescription>
                Profiliniz henüz Klinik Yönetici tarafından doğrulanmamıştır. Karar taslağı kaydedebilirsiniz ancak nihai karar sunamazsınız.
              </AlertDescription>
            </Alert>
          )}

          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Hata</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle>Başarılı</AlertTitle>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {/* Decision Selector Buttons */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">Klinik Kararınız</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Button
                type="button"
                variant={decision === 'approve' ? 'default' : 'outline'}
                onClick={() => setDecision('approve')}
                className={`h-11 justify-start gap-2 text-xs font-semibold ${
                  decision === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
                }`}
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Onayla (Approve)</span>
              </Button>

              <Button
                type="button"
                variant={decision === 'reject' ? 'destructive' : 'outline'}
                onClick={() => setDecision('reject')}
                className="h-11 justify-start gap-2 text-xs font-semibold"
              >
                <XCircle className="h-4 w-4 shrink-0" />
                <span>Reddet (Reject)</span>
              </Button>

              <Button
                type="button"
                variant={decision === 'needs_more_evidence' ? 'default' : 'outline'}
                onClick={() => setDecision('needs_more_evidence')}
                className={`h-11 justify-start gap-2 text-xs font-semibold ${
                  decision === 'needs_more_evidence' ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''
                }`}
              >
                <HelpCircle className="h-4 w-4 shrink-0" />
                <span>Kanıt İste (Evidence)</span>
              </Button>

              <Button
                type="button"
                variant={decision === 'defer' ? 'secondary' : 'outline'}
                onClick={() => setDecision('defer')}
                className="h-11 justify-start gap-2 text-xs font-semibold"
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span>Ertele (Defer)</span>
              </Button>
            </div>
          </div>

          {/* APPROVE SPECIFIC FIELDS */}
          {decision === 'approve' && (
            <div className="space-y-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                <span>Onay Parametreleri & Klinik Değerlendirme</span>
              </div>

              {/* Severity & Evidence Strength (Section 34, 40, 41) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Clinical Severity */}
                <div className="space-y-1.5">
                  <Label htmlFor="severity" className="text-xs font-semibold text-foreground">
                    Klinik Şiddet Derecesi (Clinical Severity) *
                  </Label>
                  <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger id="severity" className="bg-background">
                      <SelectValue placeholder="Şiddet derecesi seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_LEVELS.map((lvl) => (
                        <SelectItem key={lvl.value} value={lvl.value}>
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs">{lvl.label}</span>
                            <span className="text-[10px] text-muted-foreground">{lvl.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Evidence Strength */}
                <div className="space-y-1.5">
                  <Label htmlFor="evidenceStrength" className="text-xs font-semibold text-foreground">
                    Kanıt Gücü (Evidence Strength) *
                  </Label>
                  <Select value={evidenceStrength} onValueChange={setEvidenceStrength}>
                    <SelectTrigger id="evidenceStrength" className="bg-background">
                      <SelectValue placeholder="Kanıt gücü seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {EVIDENCE_STRENGTHS.map((str) => (
                        <SelectItem key={str.value} value={str.value}>
                          <div className="flex flex-col">
                            <span className="font-semibold text-xs">{str.label}</span>
                            <span className="text-[10px] text-muted-foreground">{str.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Approved Target & Action */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="approvedTargetKey" className="text-xs font-semibold text-foreground">
                    Onaylanan Hedef (Target Key) *
                  </Label>
                  <Input
                    id="approvedTargetKey"
                    value={approvedTargetKey}
                    onChange={(e) => setApprovedTargetKey(e.target.value)}
                    className="bg-background text-xs font-mono"
                    placeholder="Örn. high_tyramine_foods"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="approvedAction" className="text-xs font-semibold text-foreground">
                    Onaylanan Eylem (Approved Action) *
                  </Label>
                  <Input
                    id="approvedAction"
                    value={approvedAction}
                    onChange={(e) => setApprovedAction(e.target.value)}
                    className="bg-background text-xs font-mono"
                    placeholder="Örn. avoid"
                  />
                </div>
              </div>

              {/* Attribution Confirmation Checkbox (Section 39) */}
              {hasAttributionRisk && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id="attributionConfirmed"
                      checked={attributionConfirmed}
                      onCheckedChange={(checked) => setAttributionConfirmed(Boolean(checked))}
                      className="mt-0.5"
                    />
                    <div className="grid gap-1 leading-none">
                      <label
                        htmlFor="attributionConfirmed"
                        className="text-xs font-bold leading-normal text-amber-900 dark:text-amber-200 cursor-pointer"
                      >
                        I confirmed that this interaction is attributable to the selected active substance.
                      </label>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                        Çoklu etken madde içeren formülasyonda etkileşimin bu tekil maddeye ait olduğunu inceledim ve teyit ediyorum.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Turkish Clinical Text (Section 42) */}
              <div className="space-y-3 pt-2 border-t border-emerald-500/20">
                <span className="text-xs font-semibold text-foreground">Klinik Metinler (Türkçe)</span>

                <div className="space-y-1">
                  <Label htmlFor="titleTr" className="text-xs text-muted-foreground">Başlık (Title TR)</Label>
                  <Input
                    id="titleTr"
                    value={titleTr}
                    onChange={(e) => setTitleTr(e.target.value)}
                    className="bg-background text-xs"
                    placeholder="Örn. Linezolid ve Tiramin İçeren Besinler Etkileşimi"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="clinicalEffectTr" className="text-xs text-muted-foreground">Klinik Etki (Clinical Effect TR)</Label>
                    <Textarea
                      id="clinicalEffectTr"
                      rows={2}
                      value={clinicalEffectTr}
                      onChange={(e) => setClinicalEffectTr(e.target.value)}
                      className="bg-background text-xs"
                      placeholder="Hipertansif kriz riski oluşturabilir..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="mechanismTr" className="text-xs text-muted-foreground">Mekanizma (Mechanism TR)</Label>
                    <Textarea
                      id="mechanismTr"
                      rows={2}
                      value={mechanismTr}
                      onChange={(e) => setMechanismTr(e.target.value)}
                      className="bg-background text-xs"
                      placeholder="MAO inhibisyonu sonucu tiramin metabolizması baskılanır..."
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="recommendationTr" className="text-xs text-muted-foreground">Klinik Öneri (Recommendation TR)</Label>
                  <Textarea
                    id="recommendationTr"
                    rows={2}
                    value={recommendationTr}
                    onChange={(e) => setRecommendationTr(e.target.value)}
                    className="bg-background text-xs"
                    placeholder="Olgunlaştırılmış peynir, fermente et ürünleri ve fıçı biradan kaçınılmalıdır..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* REJECT SPECIFIC FIELDS (Section 43) */}
          {decision === 'reject' && (
            <div className="space-y-4 rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="rejectReason" className="text-xs font-semibold text-foreground">
                  Ret Gerekçesi (Reject Reason) *
                </Label>
                <Select value={rejectReason} onValueChange={setRejectReason}>
                  <SelectTrigger id="rejectReason" className="bg-background">
                    <SelectValue placeholder="Ret gerekçesi seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {REJECT_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="text-xs">
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reviewNote" className="text-xs font-semibold text-foreground">
                  Ret Açıklaması / Gerekçe Notu *
                </Label>
                <Textarea
                  id="reviewNote"
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="bg-background text-xs"
                  placeholder="Adayın neden reddedildiğini detaylandırın..."
                />
              </div>
            </div>
          )}

          {/* NEEDS MORE EVIDENCE SPECIFIC FIELDS (Section 44) */}
          {decision === 'needs_more_evidence' && (
            <div className="space-y-4 rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="reviewNote" className="text-xs font-semibold text-foreground">
                  İstenen Kanıt & Araştırma Notu *
                </Label>
                <Textarea
                  id="reviewNote"
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="bg-background text-xs"
                  placeholder="Adayın onaylanabilmesi için literatürden veya resmi kaynaklardan hangi verilerin getirilmesi gerektiğini yazın..."
                />
              </div>
            </div>
          )}

          {/* DEFER SPECIFIC FIELDS */}
          {decision === 'defer' && (
            <div className="space-y-4 rounded-lg border border-slate-500/20 bg-slate-500/5 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="reviewNote" className="text-xs font-semibold text-foreground">
                  Erteleme Notu (Opsiyonel)
                </Label>
                <Textarea
                  id="reviewNote"
                  rows={2}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  className="bg-background text-xs"
                  placeholder="İncelemenin neden ertelendiğine dair not..."
                />
              </div>
            </div>
          )}

          {/* Optional review note for approve */}
          {decision === 'approve' && (
            <div className="space-y-1.5">
              <Label htmlFor="generalReviewNote" className="text-xs font-semibold text-muted-foreground">
                Hakem İnceleme Notu (Opsiyonel)
              </Label>
              <Textarea
                id="generalReviewNote"
                rows={2}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="text-xs"
                placeholder="Konsensüs veya audit için eklemek istediğiniz hakem notu..."
              />
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-border/60 bg-muted/20 p-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isSubmitting || !evidenceAvailable}
            className="gap-1.5 text-xs"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Taslak Olarak Kaydet</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              disabled={isSubmitting || !isVerifiedReviewer || !evidenceAvailable}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-10 px-6 gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Karar Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Nihai Kararı Gönder</span>
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
