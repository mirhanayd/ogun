// GitHub issue #35 / Prompt 6.1 — "Diyet planı şablonu". TEK react-pdf
// bileşeni, hem sunucu tarafı (render.ts renderToBuffer) hem tarayıcı
// tarafı (apps/web'in PDFViewer/BlobProvider önizlemesi) tarafından AYNEN
// kullanılır — "tek kaynak" (bkz. paket dosya başı notu, types.ts).
//
// GÖREV eşlemesi:
// - Header: klinik logosu, danışan adı, tarih, diyetisyen adı.
// - Öğün blokları: saat, öğün adı, kalemler, girintili alternatifler.
// - Footer: genel öneriler, su tüketimi hatırlatması, sonraki randevu
//   (veri kaynağı yoksa BÖLÜM HİÇ BASILMAZ — bkz. types.ts
//   nextAppointmentText notu).
// - Opsiyonel besin öğesi özeti sayfası.
// - Değişim formatında sonda grup eşdeğerleri tablosu.
// - Kompakt/geniş yoğunluk + kalori göster/gizle şablonu seçenekleri.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { INTER_FONT_FAMILY } from '../font-family'
import type { PdfDay, PdfMeal, PdfMealItem, PdfPlanData } from '../types'

const DEFAULT_BRAND_COLOR = '#16a34a'

// GÖREV: "Kompakt / geniş layout" — iki yoğunluk seviyesinin somut ölçü
// farkları (satır aralığı, iç boşluk, font boyutu) burada TEK yerde
// toplanıyor, bileşenlerin geri kalanı bu tabloya bakar.
const DENSITY = {
  compact: { mealGap: 6, itemGap: 2, fontSize: 8.5, padding: 8, headingSize: 10 },
  spacious: { mealGap: 12, itemGap: 4.5, fontSize: 10, padding: 14, headingSize: 12 },
} as const

function styles(color: string, density: 'compact' | 'spacious') {
  const d = DENSITY[density]
  return StyleSheet.create({
    page: {
      fontFamily: INTER_FONT_FAMILY,
      fontSize: d.fontSize,
      color: '#18181b',
      padding: 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 2,
      borderBottomColor: color,
      paddingBottom: 10,
      marginBottom: 14,
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 40, height: 40, objectFit: 'contain' },
    clinicName: { fontSize: d.headingSize + 2, fontWeight: 700, color },
    clinicContact: { fontSize: d.fontSize - 1.5, color: '#71717a', marginTop: 2 },
    headerRight: { alignItems: 'flex-end' },
    planName: { fontSize: d.headingSize, fontWeight: 600 },
    metaLine: { fontSize: d.fontSize - 1, color: '#52525b', marginTop: 1 },
    daySection: { marginBottom: d.mealGap + 2 },
    dayLabel: {
      fontSize: d.headingSize - 1,
      fontWeight: 600,
      marginBottom: 4,
      color,
    },
    mealBlock: {
      marginBottom: d.mealGap,
      breakInside: 'avoid',
    },
    mealHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f4f4f5',
      paddingVertical: 3,
      paddingHorizontal: 6,
      borderRadius: 3,
    },
    mealTime: { width: 42, fontSize: d.fontSize - 1, color: '#52525b' },
    mealName: { fontWeight: 600, flexGrow: 1 },
    mealTotalKcal: { fontSize: d.fontSize - 1, color: '#52525b' },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: d.itemGap,
      paddingHorizontal: 6,
      borderBottomWidth: 0.5,
      borderBottomColor: '#e4e4e7',
    },
    itemName: { flexGrow: 1, paddingRight: 8 },
    itemOptionalBadge: { color: '#a1a1aa', fontSize: d.fontSize - 1.5 },
    itemAmount: { color: '#3f3f46', fontVariantNumeric: 'tabular-nums' },
    itemNote: { fontSize: d.fontSize - 1.5, color: '#71717a', paddingHorizontal: 6, paddingBottom: 2 },
    alternativeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: d.itemGap - 0.5,
      paddingLeft: 18,
      paddingRight: 6,
    },
    alternativeLabel: { color: '#71717a', fontSize: d.fontSize - 1 },
    alternativeAmount: { color: '#71717a', fontSize: d.fontSize - 1, fontVariantNumeric: 'tabular-nums' },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 32,
      right: 32,
      borderTopWidth: 0.75,
      borderTopColor: '#d4d4d8',
      paddingTop: 6,
      fontSize: d.fontSize - 1.5,
      color: '#52525b',
    },
    footerLine: { marginBottom: 2 },
    pageNumber: {
      position: 'absolute',
      bottom: 10,
      right: 32,
      fontSize: 7.5,
      color: '#a1a1aa',
    },
    summaryTitle: { fontSize: d.headingSize, fontWeight: 700, marginBottom: 10, color },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: d.itemGap,
      borderBottomWidth: 0.5,
      borderBottomColor: '#e4e4e7',
    },
    summaryLabel: { flexGrow: 1 },
    summaryValue: { width: 70, textAlign: 'right' },
    summaryPercent: { width: 50, textAlign: 'right', color: '#71717a' },
    warningLine: { fontSize: d.fontSize - 1, color: '#b45309', marginTop: 2 },
    exchangeGroupBlock: { marginBottom: d.mealGap - 2 },
    exchangeHeader: { fontWeight: 600, marginBottom: 2 },
    exchangeBody: { fontSize: d.fontSize - 1, color: '#3f3f46' },
  })
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function ItemAmount({
  item,
  showCalories,
  s,
}: {
  item: { amountText: string; kcal: number | null }
  showCalories: boolean
  s: ReturnType<typeof styles>
}) {
  return (
    <Text style={s.itemAmount}>
      {item.amountText}
      {showCalories && item.kcal !== null ? `  ·  ${Math.round(item.kcal)} kcal` : ''}
    </Text>
  )
}

function MealItemRow({
  item,
  showCalories,
  s,
}: {
  item: PdfMealItem
  showCalories: boolean
  s: ReturnType<typeof styles>
}) {
  return (
    <View>
      <View style={s.itemRow}>
        <Text style={s.itemName}>
          {item.name}
          {item.isOptional ? <Text style={s.itemOptionalBadge}> (isteğe bağlı)</Text> : null}
        </Text>
        <ItemAmount item={item} showCalories={showCalories} s={s} />
      </View>
      {item.note ? <Text style={s.itemNote}>Not: {item.note}</Text> : null}
      {item.alternatives.map((alt) => (
        <View key={alt.id} style={s.alternativeRow}>
          <Text style={s.alternativeLabel}>veya {alt.name}</Text>
          <ItemAmount item={alt} showCalories={showCalories} s={s} />
        </View>
      ))}
    </View>
  )
}

function MealBlockView({
  meal,
  showCalories,
  s,
}: {
  meal: PdfMeal
  showCalories: boolean
  s: ReturnType<typeof styles>
}) {
  return (
    <View style={s.mealBlock} wrap={false}>
      <View style={s.mealHeaderRow}>
        <Text style={s.mealTime}>{meal.time ?? ''}</Text>
        <Text style={s.mealName}>{meal.name}</Text>
        {showCalories && meal.totalKcal !== null && (
          <Text style={s.mealTotalKcal}>{Math.round(meal.totalKcal)} kcal</Text>
        )}
      </View>
      {meal.items.map((item) => (
        <MealItemRow key={item.id} item={item} showCalories={showCalories} s={s} />
      ))}
      {meal.items.length === 0 && <Text style={s.itemNote}>Bu öğün için kalem girilmedi.</Text>}
    </View>
  )
}

function PlanHeader({ data, s }: { data: PdfPlanData; s: ReturnType<typeof styles> }) {
  return (
    <View style={s.header} fixed>
      <View style={s.headerLeft}>
        {data.clinic.logoDataUri && <Image style={s.logo} src={data.clinic.logoDataUri} />}
        <View>
          <Text style={s.clinicName}>{data.clinic.name}</Text>
          {(data.clinic.phone || data.clinic.address) && (
            <Text style={s.clinicContact}>
              {[data.clinic.phone, data.clinic.address].filter(Boolean).join('  ·  ')}
            </Text>
          )}
        </View>
      </View>
      <View style={s.headerRight}>
        <Text style={s.planName}>{data.planName}</Text>
        <Text style={s.metaLine}>{data.clientName}</Text>
        <Text style={s.metaLine}>{formatDate(data.generatedAt)}</Text>
        {data.dietitianName && <Text style={s.metaLine}>Diyetisyen: {data.dietitianName}</Text>}
      </View>
    </View>
  )
}

function PlanFooter({ data, s }: { data: PdfPlanData; s: ReturnType<typeof styles> }) {
  const hasFooterContent = data.generalInstructions || data.waterIntakeReminder || data.nextAppointmentText
  if (!hasFooterContent) return null
  return (
    <View style={s.footer} fixed>
      {data.generalInstructions && (
        <Text style={s.footerLine}>Genel öneriler: {data.generalInstructions}</Text>
      )}
      {data.waterIntakeReminder && <Text style={s.footerLine}>{data.waterIntakeReminder}</Text>}
      {/* GÖREV: "bir sonraki randevu" — randevu modülü bu repoda henüz YOK
          (bkz. types.ts nextAppointmentText notu). Veri geldiğinde basılır,
          gelmediğinde satır TAMAMEN atlanır — sahte/placeholder metin
          ÜRETİLMEZ. */}
      {data.nextAppointmentText && <Text style={s.footerLine}>{data.nextAppointmentText}</Text>}
    </View>
  )
}

const BAND_LABEL_TR: Record<string, string> = {
  low: 'Düşük',
  adequate: 'Yeterliye yakın',
  optimal: 'Yeterli',
  excessive: 'Üst sınırın üstünde',
  no_reference: 'Referans yok',
}

function NutrientSummaryPage({ data, s }: { data: PdfPlanData; s: ReturnType<typeof styles> }) {
  const summary = data.nutrientSummary
  if (!summary) return null
  return (
    <Page size="A4" style={s.page}>
      <PlanHeader data={data} s={s} />
      <Text style={s.summaryTitle}>Besin öğesi özeti</Text>
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Toplam enerji</Text>
        <Text style={s.summaryValue}>{Math.round(summary.totalKcal)} kcal</Text>
        {summary.targetKcal !== null && (
          <Text style={s.summaryPercent}>
            %{Math.round((summary.totalKcal / summary.targetKcal) * 100)}
          </Text>
        )}
      </View>
      <View style={s.summaryRow}>
        <Text style={s.summaryLabel}>Makro dağılımı</Text>
        <Text style={s.summaryValue}>
          P %{summary.macroDistribution.proteinPercent.toFixed(0)} · K{' '}
          %{summary.macroDistribution.carbPercent.toFixed(0)} · Y{' '}
          %{summary.macroDistribution.fatPercent.toFixed(0)}
        </Text>
      </View>
      {summary.nutrients.map((n) => (
        <View key={n.nameTr} style={s.summaryRow}>
          <Text style={s.summaryLabel}>{n.nameTr}</Text>
          <Text style={s.summaryValue}>
            {n.actualValue.toFixed(1)} {n.unit}
          </Text>
          <Text style={s.summaryPercent}>
            {n.percentOfReference !== null ? `%${n.percentOfReference.toFixed(0)}` : BAND_LABEL_TR[n.band]}
          </Text>
        </View>
      ))}
      {summary.warnings.map((warning, index) => (
        <Text key={index} style={s.warningLine}>
          • {warning}
        </Text>
      ))}
      <Text
        style={s.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  )
}

function ExchangeEquivalentsPage({ data, s }: { data: PdfPlanData; s: ReturnType<typeof styles> }) {
  const rows = data.exchangeEquivalents
  if (!rows || rows.length === 0) return null
  return (
    <Page size="A4" style={s.page}>
      <PlanHeader data={data} s={s} />
      <Text style={s.summaryTitle}>Grup eşdeğerleri tablosu</Text>
      {rows.map((row) => (
        <View key={row.groupCode} style={s.exchangeGroupBlock} wrap={false}>
          <Text style={s.exchangeHeader}>{row.headerText}</Text>
          <Text style={s.exchangeBody}>
            {row.equivalents.length === 0
              ? 'Bu grup için eşleştirilmiş besin verisi yok.'
              : row.equivalents.map((e) => e.portionText ?? e.gramText).join('  =  ')}
          </Text>
        </View>
      ))}
      <Text
        style={s.pageNumber}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        fixed
      />
    </Page>
  )
}

function DaySectionView({ day, showCalories, s }: { day: PdfDay; showCalories: boolean; s: ReturnType<typeof styles> }) {
  return (
    <View style={s.daySection}>
      <Text style={s.dayLabel}>{day.label}</Text>
      {day.meals.map((meal) => (
        <MealBlockView key={meal.id} meal={meal} showCalories={showCalories} s={s} />
      ))}
    </View>
  )
}

// GÖREV: "Hedef: tek sayfaya sığsın; taşarsa mantıklı şekilde bölünsün."
// react-pdf'in kendi sayfalama motoru (Page + View wrap) bunu otomatik
// yapar — burada sadece öğün bloklarının `wrap={false}` ile (yukarıda
// MealBlockView) YARIDAN bölünmesini engelliyoruz, sayfa/gün sınırını
// BİLEREK zorlamıyoruz (kısa bir plan tek sayfada kalır, uzun bir plan
// react-pdf'in doğal akışıyla ikinci sayfaya taşar).
export function DietPlanDocument({ data }: { data: PdfPlanData }) {
  const color = data.clinic.primaryColor ?? DEFAULT_BRAND_COLOR
  const s = styles(color, data.layout.density)
  return (
    <Document title={`${data.planName} — ${data.clientName}`} author={data.clinic.name}>
      <Page size="A4" style={s.page} wrap>
        <PlanHeader data={data} s={s} />
        {data.days.map((day) => (
          <DaySectionView key={day.id} day={day} showCalories={data.layout.showCalories} s={s} />
        ))}
        <PlanFooter data={data} s={s} />
        <Text
          style={s.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
      {data.layout.includeNutrientSummaryPage && <NutrientSummaryPage data={data} s={s} />}
      {data.layout.format === 'değişim_listesi' && <ExchangeEquivalentsPage data={data} s={s} />}
    </Document>
  )
}
