'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import type { DocumentCategory } from '@ogun/db/schema'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DOCUMENT_CATEGORY_LABELS_TR } from '@/lib/validation/document-schemas'
import { deleteDocumentAction, getDocumentDownloadUrlAction } from './actions'

export interface DocumentRow {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  category: DocumentCategory
  createdAt: string // ISO
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDateTr(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// GÖREV 3 — "Görsel ve PDF önizleme." Küçük resim (thumbnail) BİLEREK
// otomatik ÖNCEDEN yüklenmiyor: her thumbnail ayrı bir presigned URL +
// ayrı bir denetim kaydı (action:'read') demek — bir listede 50 belge
// varsa sayfa açılışında 50 gereksiz "erişim" logu üretmek KVKK erişim
// logunun anlamını sulandırır. Bunun yerine "Görüntüle" TIKLANDIĞINDA
// (gerçek bir erişim anında) presigned URL istenir ve yeni sekmede açılır
// — tarayıcı PDF/görseli native olarak render eder.
export function DocumentList({
  clientId,
  documents,
}: {
  clientId: string
  documents: DocumentRow[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleView(doc: DocumentRow) {
    setBusyId(doc.id)
    setError(null)
    startTransition(async () => {
      const result = await getDocumentDownloadUrlAction(doc.id)
      setBusyId(null)
      if (!result.success || !result.url) {
        setError(result.error ?? 'Belge açılamadı.')
        return
      }
      window.open(result.url, '_blank', 'noopener,noreferrer')
    })
  }

  function handleDelete(doc: DocumentRow) {
    setBusyId(doc.id)
    startTransition(async () => {
      await deleteDocumentAction(doc.id, clientId)
      router.refresh()
      setBusyId(null)
    })
  }

  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz dosya yüklenmedi.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col divide-y divide-border rounded-lg border">
        {documents.map((doc) => (
          <div key={doc.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            {doc.mimeType.startsWith('image/') ? (
              <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="font-medium">{doc.fileName}</span>
            <Badge variant="outline">{DOCUMENT_CATEGORY_LABELS_TR[doc.category]}</Badge>
            <span className="text-xs text-muted-foreground">
              {formatSize(doc.sizeBytes)} · {formatDateTr(doc.createdAt)}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={isPending && busyId === doc.id}
                onClick={() => handleView(doc)}
                aria-label="Belgeyi görüntüle"
              >
                <Eye className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={isPending && busyId === doc.id}
                onClick={() => handleDelete(doc)}
                aria-label="Belgeyi sil"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
