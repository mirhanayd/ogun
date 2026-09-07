'use client'

import { useEffect, useRef, useState } from 'react'
import {
  TANITA_DUPLICATE_MESSAGE,
  type MeasurementDeviceImport,
} from '@ogun/db/measurement-device-import'
import { parseTanitaCsv, TANITA_MAX_FILE_BYTES } from '@/lib/tanita/parse-csv'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function TanitaImportControl({
  onSelect,
  existingFingerprints = [],
}: {
  onSelect: (item: MeasurementDeviceImport) => void
  existingFingerprints?: string[]
}) {
  const [rows, setRows] = useState<MeasurementDeviceImport[]>([])
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const generation = useRef(0)
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )
  function select(items: MeasurementDeviceImport[], index: number) {
    const item = items[index]
    if (!item) return
    setSelected(index)
    if (existingFingerprints.includes(item.fingerprint)) {
      setError(TANITA_DUPLICATE_MESSAGE)
      return
    }
    setError(null)
    onSelect(item)
  }
  async function openFile(file?: File) {
    if (!file) return
    const request = ++generation.current
    setLoading(true)
    setError(null)
    setRows([])
    try {
      if (file.size > TANITA_MAX_FILE_BYTES)
        throw new Error('Tanita dosyası en fazla 2 MB olabilir.')
      const ext = file.name.toLowerCase().split('.').at(-1)
      const imports =
        ext === 'csv'
          ? await parseTanitaCsv(await file.text())
          : ext === 'pdf'
            ? await (
                await import('@/lib/tanita/parse-pdf')
              ).parseTanitaPdf(new Uint8Array(await file.arrayBuffer()))
            : null
      if (!imports) throw new Error('Tanita CSV veya desteklenen BC-601 PDF dosyasını seçin.')
      if (request !== generation.current) return
      setRows(imports)
      select(imports, 0)
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error && reason.name !== 'ZodError'
            ? reason.message
            : 'Tanita ölçüm değerleri geçersiz. Dosyayı kontrol edin.',
        )
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }
  return (
    <div
      className="space-y-3 rounded-xl border border-dashed p-4"
      data-tanita-import
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        void openFile(event.dataTransfer.files[0])
      }}
    >
      <Label htmlFor="tanita-file">Tanita dosyasını içe aktar</Label>
      <Input
        id="tanita-file"
        type="file"
        accept=".csv,.pdf"
        disabled={loading}
        onChange={(event) => {
          void openFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <p className="text-xs text-muted-foreground">
        BC-601 CSV veya metin katmanlı PDF dosyasını seçin ya da buraya sürükleyin. Değerleri
        kontrol ettikten sonra Ölçümü kaydet düğmesine basın.
      </p>
      {loading ? <p role="status">Dosya okunuyor…</p> : null}
      {rows.length > 1 ? (
        <div className="space-y-1">
          <Label htmlFor="tanita-row">İçe aktarılacak ölçüm — Tarih | Saat | Kilo</Label>
          <select
            id="tanita-row"
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={selected}
            onChange={(event) => select(rows, Number(event.target.value))}
          >
            {rows.map((row, index) => (
              <option key={`${row.fingerprint}-${index}`} value={index}>
                {row.normalizedPayload.date} | {row.normalizedPayload.time} |{' '}
                {row.normalizedPayload.weightKg} kg
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TanitaDeviceDetails({ deviceImport }: { deviceImport: MeasurementDeviceImport }) {
  const value = deviceImport.normalizedPayload
  const show = (number: number | null, unit = '') =>
    number === null ? '—' : `${number} ${unit}`.trim()
  return (
    <details className="rounded-lg border p-3 text-sm" data-tanita-device-details>
      <summary className="cursor-pointer font-medium">
        Tanita cihaz verileri · {value.deviceModel}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-muted-foreground">
          {value.date} · {value.time} (Türkiye saati) · {deviceImport.sourceFormat.toUpperCase()}
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ['Cihaz BKİ', value.importedBmi, ''],
            ['Su', value.bodyWaterPct, '%'],
            ['Kemik kütlesi', value.boneMassKg, 'kg'],
            ['Metabolik yaş', value.metabolicAgeYears, 'yıl'],
            ['Günlük kalori değeri', value.dailyCalorieIntakeKcal, 'kcal'],
          ].map(([label, number, unit]) => (
            <div key={String(label)}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{show(number as number | null, String(unit))}</dd>
            </div>
          ))}
        </dl>
        <table className="w-full text-left">
          <caption className="mb-2 text-left font-medium">Segmental ölçümler</caption>
          <thead>
            <tr>
              <th>Bölge</th>
              <th>Yağ (%)</th>
              <th>Kas (kg)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Sağ kol', value.segmentalFat.rightArmPct, value.segmentalMuscle.rightArmKg],
              ['Sol kol', value.segmentalFat.leftArmPct, value.segmentalMuscle.leftArmKg],
              ['Sağ bacak', value.segmentalFat.rightLegPct, value.segmentalMuscle.rightLegKg],
              ['Sol bacak', value.segmentalFat.leftLegPct, value.segmentalMuscle.leftLegKg],
              ['Gövde', value.segmentalFat.trunkPct, value.segmentalMuscle.trunkKg],
            ].map(([label, fat, muscle]) => (
              <tr key={String(label)}>
                <td className="py-1">{label}</td>
                <td>{show(fat as number | null)}</td>
                <td>{show(muscle as number | null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">
          Cihaz referans değerleri korunur; formda yaptığınız düzeltmeler kaydedilen ölçüm
          alanlarına uygulanır.
        </p>
      </div>
    </details>
  )
}
