'use client'

import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { CategoricalChartState } from 'recharts/types/chart/types'
import { calculateBmi } from '@ogun/nutrition-core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MEASUREMENT_SOURCE_LABELS_TR } from '@/lib/validation/measurement-schemas'
import type { MeasurementSource } from '@ogun/db/schema'

export interface ChartMeasurement {
  id: string
  measuredAt: string // ISO
  source: MeasurementSource
  weightKg: number | null
  heightCm: number | null
  waistCm: number | null
  hipCm: number | null
  neckCm: number | null
  armCm: number | null
  thighCm: number | null
  chestCm: number | null
  bodyFatPct: number | null
  notes: string | null
}

export interface WeightGoalSummary {
  targetValue: number
}

type TimeRange = '1m' | '3m' | '6m' | 'all'

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1m', label: '1 ay' },
  { value: '3m', label: '3 ay' },
  { value: '6m', label: '6 ay' },
  { value: 'all', label: 'Tümü' },
]

const TIME_RANGE_DAYS: Record<Exclude<TimeRange, 'all'>, number> = { '1m': 30, '3m': 90, '6m': 180 }

function formatDateTr(ms: number): string {
  return new Date(ms).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Çevre ölçümü serileri — renk sırası SABİT (bkz. globals.css --chart-1..6
// üstündeki not, dataviz skill'inin "kategorik hue sırası asla döngüsel
// olmaz" kuralı): filtre hangi serilerin veri içerdiğini değiştirebilir ama
// bir vücut bölgesinin rengi HER ZAMAN aynı kalır — "kimlik" rengin taşıdığı
// anlam, filtre değişince hayatta kalanlar yeniden boyanmaz.
const CIRCUMFERENCE_SERIES: { key: keyof ChartMeasurement; label: string; color: string }[] = [
  { key: 'waistCm', label: 'Bel', color: 'var(--color-chart-1)' },
  { key: 'hipCm', label: 'Kalça', color: 'var(--color-chart-2)' },
  { key: 'neckCm', label: 'Boyun', color: 'var(--color-chart-3)' },
  { key: 'armCm', label: 'Kol', color: 'var(--color-chart-4)' },
  { key: 'thighCm', label: 'Uyluk', color: 'var(--color-chart-5)' },
  { key: 'chestCm', label: 'Göğüs', color: 'var(--color-chart-6)' },
]

// GÖREV 3 — İlerleme grafikleri: kilo (hedef çizgisiyle), vücut yağ %, çevre
// ölçümleri. Zaman aralığı seçici + ölçüm noktasına tıklayınca o günün
// detayı (tek bir paylaşılan `chartData` dizisi ÜÇ grafikte de KULLANILIYOR
// — Recharts'ın onClick'i activeTooltipIndex döner, bu index üç grafikte de
// AYNI ölçüm satırına karşılık gelsin diye).
export function ProgressCharts({
  measurements,
  weightGoal,
}: {
  measurements: ChartMeasurement[]
  weightGoal: WeightGoalSummary | null
}) {
  const [range, setRange] = useState<TimeRange>('all')
  const [selected, setSelected] = useState<ChartMeasurement | null>(null)

  const filtered = useMemo(() => {
    if (range === 'all') return measurements
    const cutoffMs = Date.now() - TIME_RANGE_DAYS[range] * 24 * 60 * 60 * 1000
    return measurements.filter((m) => new Date(m.measuredAt).getTime() >= cutoffMs)
  }, [measurements, range])

  const chartData = useMemo(
    () => filtered.map((m) => ({ ...m, measuredAtMs: new Date(m.measuredAt).getTime() })),
    [filtered],
  )

  const hasCircumferenceData = CIRCUMFERENCE_SERIES.some((series) =>
    chartData.some((point) => point[series.key] !== null),
  )
  const hasBodyFatData = chartData.some((point) => point.bodyFatPct !== null)

  function handleChartClick(state: CategoricalChartState) {
    const index = state.activeTooltipIndex
    if (index === undefined || index === null) return
    const point = filtered[index]
    if (point) setSelected(point)
  }

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Seçilen zaman aralığında ölçüm bulunamadı.</p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 self-start rounded-lg bg-muted p-[3px] text-sm">
        {TIME_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            aria-pressed={range === option.value}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              range === option.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Kilo (kg)</p>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <LineChart
              data={chartData}
              onClick={handleChartClick}
              margin={{ left: 4, right: 12, top: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="measuredAtMs"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={formatDateTr}
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                stroke="var(--muted-foreground)"
                fontSize={12}
                tickLine={false}
                width={40}
              />
              <Tooltip
                labelFormatter={(value) => formatDateTr(Number(value))}
                formatter={(value: number) => [`${value.toFixed(1)} kg`, 'Kilo']}
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  borderColor: 'var(--border)',
                  fontSize: 12,
                }}
              />
              {weightGoal && (
                <ReferenceLine
                  y={weightGoal.targetValue}
                  stroke="var(--color-chart-2)"
                  strokeDasharray="6 4"
                  label={{
                    value: 'Hedef',
                    position: 'insideTopRight',
                    fontSize: 11,
                    fill: 'var(--color-chart-2)',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="weightKg"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                dot={{ r: 4, cursor: 'pointer' }}
                activeDot={{ r: 6, cursor: 'pointer' }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {hasBodyFatData && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Vücut yağ oranı (%)</p>
          <div className="h-48 w-full">
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                onClick={handleChartClick}
                margin={{ left: 4, right: 12, top: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="measuredAtMs"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatDateTr}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  labelFormatter={(value) => formatDateTr(Number(value))}
                  formatter={(value: number) => [`%${value.toFixed(1)}`, 'Yağ oranı']}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--border)',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="bodyFatPct"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                  dot={{ r: 4, cursor: 'pointer' }}
                  activeDot={{ r: 6, cursor: 'pointer' }}
                  connectNulls
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {hasCircumferenceData && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Çevre ölçümleri (cm)</p>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                onClick={handleChartClick}
                margin={{ left: 4, right: 12, top: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="measuredAtMs"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={formatDateTr}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  stroke="var(--muted-foreground)"
                  fontSize={12}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  labelFormatter={(value) => formatDateTr(Number(value))}
                  contentStyle={{
                    backgroundColor: 'var(--card)',
                    borderColor: 'var(--border)',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {CIRCUMFERENCE_SERIES.filter((series) =>
                  chartData.some((point) => point[series.key] !== null),
                ).map((series) => (
                  <Line
                    key={series.key}
                    type="monotone"
                    dataKey={series.key}
                    name={series.label}
                    stroke={series.color}
                    strokeWidth={2}
                    dot={{ r: 3, cursor: 'pointer' }}
                    activeDot={{ r: 5, cursor: 'pointer' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {selected && (
        <MeasurementDetailCard measurement={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

function MeasurementDetailCard({
  measurement,
  onClose,
}: {
  measurement: ChartMeasurement
  onClose: () => void
}) {
  const bmi =
    measurement.weightKg !== null && measurement.heightCm !== null
      ? calculateBmi(measurement.weightKg, measurement.heightCm)
      : null

  const fields: { label: string; value: string }[] = [
    { label: 'Kilo', value: measurement.weightKg !== null ? `${measurement.weightKg} kg` : '—' },
    { label: 'BKİ', value: bmi !== null ? bmi.toFixed(1) : '—' },
    { label: 'Bel', value: measurement.waistCm !== null ? `${measurement.waistCm} cm` : '—' },
    { label: 'Kalça', value: measurement.hipCm !== null ? `${measurement.hipCm} cm` : '—' },
    {
      label: 'Yağ oranı',
      value: measurement.bodyFatPct !== null ? `%${measurement.bodyFatPct}` : '—',
    },
  ]

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">
              {formatDateTr(new Date(measurement.measuredAt).getTime())}
            </p>
            <Badge variant="outline">{MEASUREMENT_SOURCE_LABELS_TR[measurement.source]}</Badge>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Kapat
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
          {fields.map((field) => (
            <div key={field.label} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <span className="font-medium">{field.value}</span>
            </div>
          ))}
        </div>
        {measurement.notes && <p className="text-sm text-muted-foreground">{measurement.notes}</p>}
      </CardContent>
    </Card>
  )
}
