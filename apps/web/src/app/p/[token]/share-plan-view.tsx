import type { PdfDay, PdfMeal, PdfMealItem, PdfPlanData } from '@ogun/pdf'

// GitHub issue #36 / Prompt 6.2, GÖREV 1 — "mobil öncelikli plan görüntüleme
// sayfası". packages/pdf/src/components/DietPlanDocument.tsx'in AYNI
// PdfPlanData şeklini tüketir (bkz. o dosya, react-pdf View/Text ile) ama
// react-pdf DEĞİL — düz bir Tailwind server component, çünkü bu sayfa bir
// TARAYICI sekmesinde (danışanın telefonunda) açılacak, PDF motoruna hiç
// ihtiyaç yok (react-pdf bundle'ını public bir sayfaya taşımak gereksiz
// ağırlık olurdu). İçerik/sıralama DietPlanDocument'in header/gün/öğün/
// footer yapısıyla BİLİNÇLİ olarak paralel (danışan aynı planı hem PDF'te
// hem burada AYNI mantıkla görsün).
const DEFAULT_BRAND_COLOR = '#16a34a'

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function ItemAmount({ item, showCalories }: { item: { amountText: string; kcal: number | null }; showCalories: boolean }) {
  return (
    <span className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
      {item.amountText}
      {showCalories && item.kcal !== null ? ` · ${Math.round(item.kcal)} kcal` : ''}
    </span>
  )
}

function MealItemRow({ item, showCalories }: { item: PdfMealItem; showCalories: boolean }) {
  return (
    <div className="border-b border-border py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm">
          {item.name}
          {item.isOptional && <span className="text-xs text-muted-foreground"> (isteğe bağlı)</span>}
        </span>
        <ItemAmount item={item} showCalories={showCalories} />
      </div>
      {item.note && <p className="mt-0.5 text-xs text-muted-foreground">Not: {item.note}</p>}
      {item.alternatives.map((alt) => (
        <div key={alt.id} className="mt-1 flex items-start justify-between gap-3 pl-4">
          <span className="text-xs text-muted-foreground">veya {alt.name}</span>
          <ItemAmount item={alt} showCalories={showCalories} />
        </div>
      ))}
    </div>
  )
}

function MealBlockView({ meal, showCalories, color }: { meal: PdfMeal; showCalories: boolean; color: string }) {
  return (
    <div className="mb-4 rounded-lg border border-border">
      <div
        className="flex items-center justify-between rounded-t-lg px-3 py-2"
        style={{ backgroundColor: `${color}1a` }}
      >
        <div className="flex items-center gap-2">
          {meal.time && <span className="text-xs text-muted-foreground">{meal.time}</span>}
          <span className="text-sm font-semibold">{meal.name}</span>
        </div>
        {showCalories && meal.totalKcal !== null && (
          <span className="text-xs text-muted-foreground">{Math.round(meal.totalKcal)} kcal</span>
        )}
      </div>
      <div className="px-3">
        {meal.items.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">Bu öğün için kalem girilmedi.</p>
        ) : (
          meal.items.map((item) => <MealItemRow key={item.id} item={item} showCalories={showCalories} />)
        )}
      </div>
    </div>
  )
}

function DaySectionView({ day, showCalories, color }: { day: PdfDay; showCalories: boolean; color: string }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold" style={{ color }}>
        {day.label}
      </h2>
      {day.meals.map((meal) => (
        <MealBlockView key={meal.id} meal={meal} showCalories={showCalories} color={color} />
      ))}
    </section>
  )
}

export function SharePlanView({ data }: { data: PdfPlanData }) {
  const color = data.clinic.primaryColor ?? DEFAULT_BRAND_COLOR
  const hasFooter = data.generalInstructions || data.waterIntakeReminder || data.nextAppointmentText

  return (
    <div className="min-h-svh bg-muted/30 pb-10">
      <header className="border-b-2 bg-background px-4 py-4" style={{ borderColor: color }}>
        <div className="mx-auto flex max-w-lg items-center gap-3">
          {data.clinic.logoDataUri && (
            // eslint-disable-next-line @next/next/no-img-element -- data URI, next/image optimize edemez
            <img src={data.clinic.logoDataUri} alt={data.clinic.name} className="size-10 shrink-0 object-contain" />
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold" style={{ color }}>
              {data.clinic.name}
            </p>
            {(data.clinic.phone || data.clinic.address) && (
              <p className="truncate text-xs text-muted-foreground">
                {[data.clinic.phone, data.clinic.address].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        <div className="mb-5">
          <h1 className="text-lg font-bold">{data.planName}</h1>
          <p className="text-sm text-muted-foreground">{data.clientName}</p>
          <p className="text-xs text-muted-foreground">{formatDate(data.generatedAt)}</p>
          {data.dietitianName && (
            <p className="text-xs text-muted-foreground">Diyetisyen: {data.dietitianName}</p>
          )}
        </div>

        {data.days.map((day) => (
          <DaySectionView key={day.id} day={day} showCalories={data.layout.showCalories} color={color} />
        ))}

        {hasFooter && (
          <div className="mt-6 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
            {data.generalInstructions && <p className="mb-1">Genel öneriler: {data.generalInstructions}</p>}
            {data.waterIntakeReminder && <p className="mb-1">{data.waterIntakeReminder}</p>}
            {data.nextAppointmentText && <p>{data.nextAppointmentText}</p>}
          </div>
        )}

        <p className="mt-6 text-center text-[0.65rem] text-muted-foreground">
          Bu bağlantı sadece plan içeriğinizi gösterir — kişisel sağlık verileriniz paylaşılmaz.
        </p>
      </main>
    </div>
  )
}
