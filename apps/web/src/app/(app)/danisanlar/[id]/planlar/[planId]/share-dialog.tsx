'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Copy, Eye, Loader2, Mail, MessageCircle, Share2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildWhatsappShareUrl, renderWhatsappMessage } from '@/lib/share/message-template'
import {
  getOrCreateShareLinkAction,
  recordWhatsappSentAction,
  revokeShareLinkAction,
  sendPlanShareEmailAction,
  type ShareLinkInfo,
} from './share-actions'

// GitHub issue #36 / Prompt 6.2 — "Danışana ulaştırma" diyaloğu.
// plan-pdf-dialog.tsx ile AYNI kabuk deseni (Dialog + local state + server
// action çağrıları), ama içerik farklı: burada PDF önizlemesi YOK, sadece
// linki YÖNET (üret/kopyala/iptal et) + iki gönderim kanalı (WhatsApp
// deep link, e-posta) + görüntüleme durumu.
export function ShareDialog({
  open,
  onOpenChange,
  planId,
  clientId,
  planName,
  clientName,
  clientPhone,
  clientEmail,
  whatsappTemplate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  planId: string
  clientId: string
  planName: string
  clientName: string
  clientPhone: string | null
  clientEmail: string | null
  whatsappTemplate: string | null
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [share, setShare] = useState<ShareLinkInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copyLabel, setCopyLabel] = useState('Kopyala')
  const [revoking, setRevoking] = useState(false)
  const [emailAddress, setEmailAddress] = useState(clientEmail ?? '')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('loading')
    setErrorMessage(null)
    setEmailSent(false)
    getOrCreateShareLinkAction(planId)
      .then((result) => {
        if (cancelled) return
        if (!result.success || !result.data) {
          setErrorMessage(result.error ?? 'Paylaşım linki oluşturulamadı.')
          setStatus('error')
          return
        }
        setShare(result.data)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Paylaşım linki oluşturulamadı.')
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, planId])

  async function handleCopy() {
    if (!share) return
    await navigator.clipboard.writeText(share.url)
    setCopyLabel('Kopyalandı')
    setTimeout(() => setCopyLabel('Kopyala'), 1500)
  }

  async function handleRevoke() {
    if (!share) return
    setRevoking(true)
    try {
      const result = await revokeShareLinkAction(share.shareId, planId, clientId)
      if (result.success) {
        setShare({ ...share, revokedAt: new Date().toISOString() })
      } else {
        setErrorMessage(result.error ?? 'Link iptal edilemedi.')
      }
    } finally {
      setRevoking(false)
    }
  }

  function handleWhatsappSend() {
    if (!share) return
    const message = renderWhatsappMessage(whatsappTemplate, { clientName, planName, shareUrl: share.url })
    const url = buildWhatsappShareUrl(clientPhone, message)
    window.open(url, '_blank', 'noopener,noreferrer')
    void recordWhatsappSentAction(clientId, share.shareId, clientPhone)
  }

  async function handleEmailSend() {
    if (!share) return
    setEmailSending(true)
    setErrorMessage(null)
    try {
      const result = await sendPlanShareEmailAction(planId, share.shareId, emailAddress)
      if (!result.success) {
        setErrorMessage(result.error ?? 'E-posta gönderilemedi.')
        return
      }
      setEmailSent(true)
    } finally {
      setEmailSending(false)
    }
  }

  const isRevoked = !!share?.revokedAt
  const isExpired = !!share?.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()
  const linkUsable = !!share && !isRevoked && !isExpired

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" />
            Danışana ulaştır
          </DialogTitle>
          <DialogDescription>
            Bu bağlantı sadece plan içeriğini gösterir — danışanın sağlık verisi, ölçümleri veya notları asla
            paylaşılmaz.
          </DialogDescription>
        </DialogHeader>

        {status === 'loading' && (
          <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Bağlantı hazırlanıyor…
          </div>
        )}

        {status === 'error' && !share && (
          <p className="text-sm text-destructive">{errorMessage ?? 'Bir hata oluştu.'}</p>
        )}

        {share && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Input readOnly value={share.url} className="h-8 text-xs" onFocus={(e) => e.target.select()} />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={!linkUsable}
                  onClick={handleCopy}
                >
                  <Copy className="size-3.5" />
                  {copyLabel}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {isRevoked ? (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="size-3" /> İptal edildi
                  </Badge>
                ) : isExpired ? (
                  <Badge variant="secondary" className="gap-1">
                    <XCircle className="size-3" /> Süresi doldu
                  </Badge>
                ) : share.viewedAt ? (
                  <Badge className="gap-1">
                    <CheckCircle2 className="size-3" /> Görüntülendi ({share.viewCount})
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1">
                    <Eye className="size-3" /> Henüz görüntülenmedi
                  </Badge>
                )}
                {!isRevoked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={revoking}
                    onClick={handleRevoke}
                  >
                    {revoking ? 'İptal ediliyor…' : 'Linki iptal et'}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">WhatsApp ile gönder</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!linkUsable}
                onClick={handleWhatsappSend}
              >
                <MessageCircle className="size-3.5" />
                {clientPhone ? `${clientPhone} numarasına aç` : 'WhatsApp’ta aç'}
              </Button>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">E-posta ile gönder (PDF ekli)</p>
              <div className="flex items-center gap-2">
                <Input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="danisan@ornek.com"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5"
                  disabled={!linkUsable || emailSending || !emailAddress}
                  onClick={handleEmailSend}
                >
                  {emailSending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
                  Gönder
                </Button>
              </div>
              {emailSent && <p className="text-xs text-muted-foreground">E-posta gönderildi.</p>}
            </div>

            {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
