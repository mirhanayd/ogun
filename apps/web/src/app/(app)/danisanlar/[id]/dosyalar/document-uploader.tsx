'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_CATEGORY_OPTIONS,
  MAX_DOCUMENT_SIZE_BYTES,
  type UploadableDocumentCategory,
} from '@/lib/validation/document-schemas'
import { confirmDocumentUploadAction, presignDocumentUploadAction } from './actions'

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

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)

    if (!(ACCEPTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Desteklenmeyen dosya türü. Yalnızca PDF veya görsel (JPEG/PNG/WEBP/HEIC) yükleyebilirsiniz.')
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
    const presignInput = { fileName: file.name, mimeType, sizeBytes: file.size, category: activeCategory }

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

    const confirm = await confirmDocumentUploadAction(clientId, { ...presignInput, storageKey: presign.storageKey })
    if (!confirm.success) {
      setError(confirm.error ?? 'Belge kaydedilemedi.')
      setStatus('idle')
      return
    }

    setStatus('idle')
    onUploaded?.()
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      {!fixedCategory && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentCategory">Kategori</Label>
          <Select value={category} onValueChange={(value) => setCategory(value as UploadableDocumentCategory)}>
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
          disabled={status === 'uploading'}
          onClick={() => inputRef.current?.click()}
        >
          {status === 'uploading' ? 'Yükleniyor…' : 'Dosya seç ve yükle'}
        </Button>
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
