'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConnectivityStatus } from '@/components/connectivity-status-provider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_CATEGORY_OPTIONS,
  MAX_DOCUMENT_SIZE_BYTES,
  type UploadableDocumentCategory,
} from '@/lib/validation/document-schemas'
import { isNativeShell } from '@/lib/native-shell'
import { confirmDocumentUploadAction, presignDocumentUploadAction } from './actions'

// GitHub issue #53 / Prompt 9.3, GÖREV 4 — tauri-plugin-dialog'un native
// seçici VE pencere geneli sürükle-bırak İKİSİ de bize SADECE bir dosya
// YOLU (path) verir, tarayıcının <input type=file>'ının aksine bir MIME
// türü VERMEZ — kabul edilen uzantılardan (ACCEPTED_DOCUMENT_MIME_TYPES ile
// TUTARLI) tahmin ediyoruz.
const EXTENSION_MIME_MAP: Record<string, (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number]> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
}

function guessMimeTypeFromPath(path: string): (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number] | null {
  const extension = path.split('.').pop()?.toLowerCase()
  return extension ? (EXTENSION_MIME_MAP[extension] ?? null) : null
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

// GÖREV 3 — "Presigned URL ile yükleme, dosyalar asla public olmasın." Üç
// adımlı akış (bkz. actions.ts dosya başı notu): 1) presign, 2) dosyayı
// DOĞRUDAN MinIO/S3'e PUT et (bu bileşen tarayıcıdan doğrudan yapar, sunucu
// dosyayı hiç görmez), 3) confirm ile DB satırını yaz.
export function DocumentUploader({
  clientId,
  fixedCategory,
  onUploaded,
}: {
  clientId: string
  // BİA içe aktarma paneli (GÖREV 4) kategori seçimini gizleyip her zaman
  // 'bia_çıktısı' gönderir — diyetisyenin doğru kategoriyi seçmeyi
  // UNUTMASI riskini ortadan kaldırır.
  fixedCategory?: UploadableDocumentCategory
  onUploaded?: () => void
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<UploadableDocumentCategory>(fixedCategory ?? 'diğer')
  const [status, setStatus] = useState<'idle' | 'uploading'>('idle')
  const [error, setError] = useState<string | null>(null)
  const offline = useConnectivityStatus() === 'offline'
  // GitHub issue #52 kod incelemesi (PR #56) hydration notuyla AYNI
  // gerekçe (bkz. native-auth-bridge.tsx): `isNativeShell()`'i DOĞRUDAN
  // render sırasında çağırmak sunucu (her zaman false) ile native
  // istemcinin İLK render'ı (window.__TAURI_INTERNALS__ o anda ZATEN
  // mevcut) ARASINDA bir hydration uyumsuzluğu yaratabilir — bu yüzden
  // başlangıç değeri SABİT `false`, gerçek değer SADECE `useEffect`
  // İÇİNDE (hydration TAMAMLANDIKTAN sonra) uygulanıyor.
  const [isNative, setIsNative] = useState(false)

  useEffect(() => {
    setIsNative(isNativeShell())
  }, [])

  // Web (<input type=file>) VE native (dialog seçici / sürükle-bırak, bkz.
  // aşağıda) yollarının İKİSİNİN de paylaştığı TEK yükleme mantığı —
  // GitHub issue #53 öncesi bu mantık `handleFileChange` içinde tekrardı,
  // burada dışa çıkarıldı (davranış AYNI, sadece kaynak — nereden bir
  // `File` nesnesi geldiği — artık ikiye ayrılabiliyor).
  async function uploadFile(file: File) {
    setError(null)

    if (offline) {
      setError('Belge yüklemek için internet bağlantısı gerekir.')
      return
    }

    if (!(ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError(
        'Desteklenmeyen dosya türü. Yalnızca PDF veya görsel (JPEG/PNG/WEBP/HEIC) yükleyebilirsiniz.',
      )
      return
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      setError('Dosya 20 MB üzerinde olamaz.')
      return
    }
    // Runtime'da yukarıda doğrulandı (includes kontrolü) — TS'e bunu bir tip
    // daralması olarak anlatmak için literal union'a assert ediyoruz.
    const mimeType = file.type as (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number]

    setStatus('uploading')
    const activeCategory = fixedCategory ?? category
    const presignInput = {
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      category: activeCategory,
    }

    const presign = await presignDocumentUploadAction(clientId, presignInput)
    if (!presign.success || !presign.uploadUrl || !presign.storageKey) {
      setError(presign.error ?? 'Yükleme başlatılamadı.')
      setStatus('idle')
      return
    }

    const putResponse = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    })
    if (!putResponse.ok) {
      setError('Dosya depolamaya yüklenemedi.')
      setStatus('idle')
      return
    }

    const confirm = await confirmDocumentUploadAction(clientId, {
      ...presignInput,
      storageKey: presign.storageKey,
    })
    if (!confirm.success) {
      setError(confirm.error ?? 'Belge kaydedilemedi.')
      setStatus('idle')
      return
    }

    setStatus('idle')
    onUploaded?.()
    router.refresh()
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await uploadFile(file)
  }

  // Native dosya seçici VE sürükle-bırak'ın PAYLAŞTIĞI: bir dosya yolundan
  // byte'ları okuyup (`readFile`, tauri-plugin-fs) bir `File` nesnesine
  // SARAR ki yukarıdaki `uploadFile` DEĞİŞİKLİKSİZ çalışsın.
  async function uploadFromNativePath(
    path: string,
    readFile: (p: string) => Promise<Uint8Array<ArrayBuffer>>,
  ) {
    const mimeType = guessMimeTypeFromPath(path)
    if (!mimeType) {
      setError(
        'Desteklenmeyen dosya türü. Yalnızca PDF veya görsel (JPEG/PNG/WEBP/HEIC) yükleyebilirsiniz.',
      )
      return
    }
    const bytes = await readFile(path)
    await uploadFile(new File([bytes], fileNameFromPath(path), { type: mimeType }))
  }

  // GÖREV 4 — "Belge yükleme: native dosya seçici (tauri-plugin-dialog)."
  async function handleNativePick() {
    setError(null)
    try {
      const [{ open }, { readFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ])
      const path = await open({
        multiple: false,
        filters: [{ name: 'Belge', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic'] }],
      })
      if (!path || Array.isArray(path)) return // kullanıcı diyaloğu İPTAL etti
      await uploadFromNativePath(path, readFile)
    } catch (err) {
      console.warn('[document-uploader] native dosya seçici başarısız', err)
      setError('Dosya seçilemedi.')
    }
  }

  // GÖREV 4 — "sürükle-bırak desteği pencere geneline yayılsın." Tauri v2
  // native OS sürükle-bırak'ı VARSAYILAN olarak KENDİSİ YAKALAR — bu YÜZDEN
  // normal HTML5 dragover/drop olayları webview İÇİNDE hiç TETİKLENMEZ,
  // `getCurrentWebviewWindow().onDragDropEvent(...)` KULLANILMALI (bkz. PR
  // açıklaması). Bu, TEK bir <div> alanına bağlı bir HTML5 dropzone'un
  // AKSİNE, PENCERENİN HERHANGİ BİR YERİNE bırakılan dosyaları yakalar —
  // issue metninin isteğiyle TUTARLI. SADECE bu bileşen mount İKEN aktif
  // (bir belge yükleme sekmesinde değilken sürüklenen dosyalar İŞLENMEZ —
  // makul bir kapsam, apps/web'in geri kalanına global bir drop-handler
  // EKLEMEDİK).
  useEffect(() => {
    if (!isNativeShell()) return
    let cancelled = false
    let unlisten: (() => void) | undefined

    void Promise.all([
      import('@tauri-apps/api/webviewWindow'),
      import('@tauri-apps/plugin-fs'),
    ]).then(([{ getCurrentWebviewWindow }, { readFile }]) => {
      if (cancelled) return
      void getCurrentWebviewWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type !== 'drop') return
          for (const path of event.payload.paths) {
            void uploadFromNativePath(path, readFile)
          }
        })
        .then((fn) => {
          if (cancelled) fn()
          else unlisten = fn
        })
    })

    return () => {
      cancelled = true
      unlisten?.()
    }
    // GÖREV — `uploadFromNativePath`/`uploadFile` clientId/category/
    // fixedCategory'e kapanır (closure); bunlardan biri değiştiğinde
    // dinleyici TAZE bir kapanışla yeniden kurulmalı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, category, fixedCategory, offline])

  return (
    <div className="flex flex-wrap items-end gap-3">
      {!fixedCategory && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentCategory">Kategori</Label>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as UploadableDocumentCategory)}
          >
            <SelectTrigger id="documentCategory" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={status === 'uploading' || offline}
          onClick={() => (isNative ? void handleNativePick() : inputRef.current?.click())}
        >
          {offline
            ? 'Bağlantı gerekiyor'
            : status === 'uploading'
              ? 'Yükleniyor…'
              : 'Dosya seç ve yükle'}
        </Button>
        {isNative && (
          <p className="text-xs text-muted-foreground">
            Pencerenin herhangi bir yerine dosya sürükleyip bırakabilirsiniz.
          </p>
        )}
        {offline && (
          <p className="text-xs text-muted-foreground">
            Dosya yükleme bağlantı geldiğinde yeniden kullanılabilir.
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_DOCUMENT_MIME_TYPES.join(',')}
          onChange={handleFileChange}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
