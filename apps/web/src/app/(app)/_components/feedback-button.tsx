'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { listen } from '@tauri-apps/api/event'
import { Camera, MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'
import { isNativeShell } from '@/lib/native-shell'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { getConsoleBufferAsText } from '@/lib/monitoring/console-buffer'
import { trackEvent } from '@/lib/analytics/track'
import { submitFeedbackAction } from './feedback-actions'

// GitHub issue #47 / Prompt 8.3, GÖREV 2 — "uygulama içi geri bildirim
// butonu (ekran görüntüsü + konsol logu ekli)".
//
// Ekran görüntüsü, tarayıcının GERÇEK ekran yakalama API'siyle
// (getDisplayMedia) alınıyor — html2canvas/dom-to-image gibi bir DOM->canvas
// kütüphanesi BİLEREK eklenmedi: bu tür kütüphaneler CSS'in karmaşık
// kısımlarını (gradient, gölge, üçüncü parti iframe/canvas içerikleri)
// sadakatle yeniden çizemez ve bir "gerçek" ekran görüntüsü YERİNE yaklaşık
// bir render üretir — bir hata raporunda tam olarak neyin göründüğü ÖNEMLİ.
// getDisplayMedia kullanıcıdan izin ister (tarayıcı kendi seçim diyaloğunu
// gösterir, hangi sekme/pencere paylaşılacağını KULLANICI seçer) — bu, bir
// ekran görüntüsünün rızasız alınamayacağının doğal bir güvencesi.
async function captureScreenshot(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return null
  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    const track = stream.getVideoTracks()[0]
    if (!track) return null

    const video = document.createElement('video')
    video.srcObject = stream
    await video.play()
    // İlk kareyi yakalamak için bir sonraki animasyon karesini bekle —
    // aksi halde canvas boş/siyah bir kare çizebilir.
    await new Promise((resolve) => requestAnimationFrame(resolve))

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    // JPEG + düşük kalite: DB'de text sütununda saklanacak (bkz.
    // feedback-actions.ts MAX_SCREENSHOT_LENGTH), PNG çok büyük olurdu.
    return canvas.toDataURL('image/jpeg', 0.6)
  } catch {
    // Kullanıcı paylaşım isteğini reddettiyse (en yaygın durum) sessizce
    // vazgeç — ekran görüntüsü OPSİYONEL, geri bildirim yine de gönderilebilir.
    return null
  } finally {
    stream?.getTracks().forEach((t) => t.stop())
  }
}

export function FeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null)
  const [capturingScreenshot, setCapturingScreenshot] = useState(false)
  const [isPending, startTransition] = useTransition()

  // GitHub issue #53 / Prompt 9.3, GÖREV 1 — native Yardım menüsündeki
  // "Geri Bildirim Gönder" öğesi (bkz. menu_actions.rs) bu MEVCUT diyaloğu
  // (issue #47) bir Tauri olayıyla açar — üstteki simgeye tıklamakla AYNI.
  useEffect(() => {
    if (!isNativeShell()) return
    const unlistenPromise = listen('ogun-menu-open-feedback', () => setOpen(true))
    return () => {
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  async function handleCapture() {
    setCapturingScreenshot(true)
    const dataUrl = await captureScreenshot()
    setCapturingScreenshot(false)
    if (!dataUrl) {
      toast.info('Ekran görüntüsü alınamadı veya izin verilmedi.')
      return
    }
    setScreenshotDataUrl(dataUrl)
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await submitFeedbackAction({
        page: pathname,
        message,
        consoleLog: getConsoleBufferAsText() || null,
        screenshotDataUrl,
      })
      if (!result.success) {
        toast.error(result.error ?? 'Geri bildirim gönderilemedi.')
        return
      }
      trackEvent({ eventName: 'feedback_submitted', screen: pathname })
      toast.success('Teşekkürler, geri bildiriminiz iletildi.')
      setOpen(false)
      setMessage('')
      setScreenshotDataUrl(null)
    })
  }

  return (
    <>
      <Button variant="ghost" size="icon" title="Geri bildirim gönder" onClick={() => setOpen(true)}>
        <MessageSquarePlus className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Geri bildirim gönder</DialogTitle>
            <DialogDescription>
              Bir hata mı buldunuz, yoksa bir öneriniz mi var? Mesajınıza (isterseniz) bir ekran
              görüntüsü ekleyebilirsiniz — son konsol logları otomatik eklenir.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ne oldu, ne bekliyordunuz?"
            rows={5}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleCapture} disabled={capturingScreenshot}>
              <Camera className="size-4" />
              {capturingScreenshot ? 'Yakalanıyor…' : screenshotDataUrl ? 'Ekran görüntüsünü değiştir' : 'Ekran görüntüsü ekle'}
            </Button>
            {screenshotDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- data: URI önizleme, next/image bunu optimize etmez
              <img src={screenshotDataUrl} alt="Ekran görüntüsü önizlemesi" className="h-10 rounded border border-border" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || message.trim().length === 0}>
              {isPending ? 'Gönderiliyor…' : 'Gönder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
