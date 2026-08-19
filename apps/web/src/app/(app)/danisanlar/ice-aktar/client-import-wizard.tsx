'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { AlertTriangle, Upload } from 'lucide-react'
import { toastActionError } from '@/lib/action-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  IMPORT_TARGET_FIELD_LABELS_TR,
  guessColumnMapping,
  validateImportRow,
  type ImportRowValidationError,
  type ImportRowValidationOk,
  type ImportTargetField,
} from '@/lib/validation/client-import'
import { importClientsAction } from './actions'

type WizardStep = 'yukle' | 'onizle' | 'tamam'

const TARGET_FIELD_OPTIONS: ImportTargetField[] = ['firstName', 'lastName', 'phone', 'birthDate', 'weightHistory', 'ignore']

interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

// GitHub issue #47 / Prompt 8.3, GÖREV 3 — "sütun eşleme arayüzü, önizleme,
// hatalı satır raporu". PapaParse SADECE dosyayı satır/hücreye böler (quote/
// virgül kaçışlarını doğru işlemek için elle bir CSV parser YAZILMADI — bu
// GERÇEK dünyada hatalara en açık kısım); geri kalan TÜM iş mantığı (sütun
// tahmini, satır doğrulama, kilo geçmişi ayrıştırma) lib/validation/
// client-import.ts'teki SAF fonksiyonlarda, birim testleriyle (bkz. o
// dosyanın .test.ts eşleniği) doğrulanıyor.
export function ClientImportWizard() {
  const router = useRouter()
  const [step, setStep] = useState<WizardStep>('yukle')
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<Record<string, ImportTargetField>>({})
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [importedCount, setImportedCount] = useState(0)
  const [fileError, setFileError] = useState<string | null>(null)

  function handleFile(file: File) {
    setFileError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? []
        if (headers.length === 0) {
          setFileError('CSV dosyası okunamadı — sütun başlığı bulunamadı.')
          return
        }
        setParsed({ headers, rows: result.data })
        setMapping(guessColumnMapping(headers))
        setStep('onizle')
      },
      error: (error: Error) => {
        setFileError(`CSV ayrıştırılamadı: ${error.message}`)
      },
    })
  }

  // Sütun eşlemesine göre ham satırları hedef alanlara indirger, sonra
  // validateImportRow ile GEÇERLİ/HATALI olarak ikiye ayırır. rowNumber
  // BAŞLIK satırını sayar (index 0 → başlık, ilk veri satırı → 2) —
  // kullanıcının Excel'de gördüğü satır numarasıyla eşleşsin diye.
  const { validRows, invalidRows } = useMemo(() => {
    if (!parsed) return { validRows: [] as ImportRowValidationOk[], invalidRows: [] as ImportRowValidationError[] }

    const fieldToHeader = new Map<ImportTargetField, string>()
    for (const [header, field] of Object.entries(mapping)) {
      if (field !== 'ignore') fieldToHeader.set(field, header)
    }

    const ok: ImportRowValidationOk[] = []
    const bad: ImportRowValidationError[] = []
    parsed.rows.forEach((row, index) => {
      const rowNumber = index + 2
      const result = validateImportRow(rowNumber, {
        firstName: fieldToHeader.has('firstName') ? row[fieldToHeader.get('firstName')!] : undefined,
        lastName: fieldToHeader.has('lastName') ? row[fieldToHeader.get('lastName')!] : undefined,
        phone: fieldToHeader.has('phone') ? row[fieldToHeader.get('phone')!] : undefined,
        birthDate: fieldToHeader.has('birthDate') ? row[fieldToHeader.get('birthDate')!] : undefined,
        weightHistory: fieldToHeader.has('weightHistory') ? row[fieldToHeader.get('weightHistory')!] : undefined,
      })
      if (result.ok) ok.push(result)
      else bad.push(result)
    })
    return { validRows: ok, invalidRows: bad }
  }, [parsed, mapping])

  function downloadBadRowReport() {
    const lines = ['Satır,Sorun', ...invalidRows.map((r) => `${r.rowNumber},"${r.reason.replace(/"/g, '""')}"`)]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hatali-satirlar.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport() {
    startTransition(async () => {
      const result = await importClientsAction(validRows, consentConfirmed)
      if (!result.success) {
        toastActionError(result.error ?? 'İçe aktarma başarısız oldu.', 'Hiçbir danışan kaydedilmedi. Sütun eşlemesini kontrol edip dosyayı yeniden yükleyin.')
        return
      }
      setImportedCount(result.importedCount ?? 0)
      setStep('tamam')
    })
  }

  if (step === 'yukle') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Upload className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">CSV dosyası seçin</p>
            <p className="text-sm text-muted-foreground">
              İlk satır sütun başlıkları olmalıdır. Sütun sırası/adı önemli değil — bir sonraki adımda
              eşleyeceksiniz.
            </p>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) handleFile(file)
            }}
            className="text-sm"
          />
          {fileError && (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="size-4" /> {fileError}
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  if (step === 'onizle' && parsed) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm font-medium">Sütun eşleme</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {parsed.headers.map((header) => (
                <div key={header} className="flex flex-col gap-1.5">
                  <p className="truncate text-xs text-muted-foreground" title={header}>
                    {header}
                  </p>
                  <Select
                    value={mapping[header] ?? 'ignore'}
                    onValueChange={(value: ImportTargetField) =>
                      setMapping((prev) => ({ ...prev, [header]: value }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_FIELD_OPTIONS.map((field) => (
                        <SelectItem key={field} value={field}>
                          {IMPORT_TARGET_FIELD_LABELS_TR[field]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Önizleme — {validRows.length} geçerli satır, {invalidRows.length} hatalı satır
              </p>
              {invalidRows.length > 0 && (
                <Button variant="outline" size="sm" onClick={downloadBadRowReport}>
                  Hatalı satır raporunu indir
                </Button>
              )}
            </div>
            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Satır</TableHead>
                    <TableHead>Ad Soyad</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Doğum tarihi</TableHead>
                    <TableHead>Kilo geçmişi</TableHead>
                    <TableHead>Uyarılar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validRows.slice(0, 50).map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>
                        {row.firstName} {row.lastName}
                      </TableCell>
                      <TableCell>{row.phone ?? '—'}</TableCell>
                      <TableCell>{row.birthDate ?? '—'}</TableCell>
                      <TableCell>{row.weightHistory.length > 0 ? `${row.weightHistory.length} ölçüm` : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.warnings.length > 0 ? row.warnings.join(' ') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {invalidRows.map((row) => (
                    <TableRow key={`invalid-${row.rowNumber}`} className="bg-destructive/5">
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell colSpan={4} className="text-sm text-destructive">
                        Atlandı: {row.reason}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={consentConfirmed} onCheckedChange={(checked) => setConsentConfirmed(checked === true)} />
              <span>
                Bu danışanlar için KVKK aydınlatma metni ve özel nitelikli veri işleme rızası kliniğim
                tarafından önceden (yazılı/sözlü) alınmıştır, bunu onaylıyorum.
              </span>
            </label>
            {!consentConfirmed && (
              <p className="text-xs text-muted-foreground">
                Onaylamazsanız danışanlar &quot;rıza bekliyor&quot; durumunda içe aktarılır — her biri için
                rızayı daha sonra danışan detay sayfasından tek tek onaylayabilirsiniz.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep('yukle')}>
                Geri
              </Button>
              <Button onClick={handleImport} disabled={isPending || validRows.length === 0}>
                {isPending ? 'İçe aktarılıyor…' : `${validRows.length} danışanı içe aktar`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm font-medium">{importedCount} danışan içe aktarıldı.</p>
        <Button onClick={() => router.push('/danisanlar')}>Danışan listesine git</Button>
      </CardContent>
    </Card>
  )
}
