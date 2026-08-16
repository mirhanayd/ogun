'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { LabResultChartPoint } from './lab-results-tab'

function formatDateTr(ms: number): string {
  return new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// GÖREV 2 — "Zaman serisi grafiği, referans aralığı bantlı." Her analitin
// birimi/ölçeği farklı olduğu için (ör. TSH 0-4 aralığında, glukoz 70-99
// aralığında) TEK bir grafikte hepsi birden GÖSTERİLEMEZ — bu yüzden
// progress-charts.tsx'teki (measurements) "birden fazla seri aynı grafikte"
// deseninden FARKLI olarak burada önce bir analit SEÇİLİR, sonra o analitin
// TEK serisi + kendi referans bandı çizilir.
export function LabChart({ results }: { results: LabResultChartPoint[] }) {
  const analytes = useMemo(() => [...new Set(results.map((r) => r.analyte))], [results])
  const [selected, setSelected] = useState(analytes[0] ?? '')
  const activeAnalyte = analytes.includes(selected) ? selected : (analytes[0] ?? '')

  const series = useMemo(
    () =>
      results
        .filter((r) => r.analyte === activeAnalyte)
        .map((r) => ({ ...r, testedAtMs: new Date(r.testedAt).getTime() })),
    [results, activeAnalyte],
  )

  if (analytes.length === 0) {
    return <p className="text-sm text-muted-foreground">Henüz laboratuvar sonucu eklenmedi.</p>
  }

  // Referans bandı: seçili analitin serisindeki EN GÜNCEL refMin/refMax —
  // farklı tarihlerde farklı referans aralığı girilmiş olabilir (laboratuvar
  // değişmiş olabilir), grafik en güncel olanı bant olarak gösterir.
  const latestWithRange = [...series].reverse().find((point) => point.refMin !== null || point.refMax !== null)
  const unit = series[series.length - 1]?.unit ?? ''

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 self-start">
        <Select value={activeAnalyte} onValueChange={setSelected}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {analytes.map((analyte) => (
              <SelectItem key={analyte} value={analyte}>
                {analyte}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer>
          <LineChart data={series} margin={{ left: 4, right: 12, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="testedAtMs"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatDateTr}
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
            />
            <YAxis domain={['auto', 'auto']} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} width={44} />
            <Tooltip
              labelFormatter={(value) => formatDateTr(Number(value))}
              formatter={(value: number) => [`${value} ${unit}`, activeAnalyte]}
              contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', fontSize: 12 }}
            />
            {latestWithRange && (
              <ReferenceArea
                y1={latestWithRange.refMin ?? undefined}
                y2={latestWithRange.refMax ?? undefined}
                fill="var(--color-chart-2)"
                fillOpacity={0.12}
                stroke="none"
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
