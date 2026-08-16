import Link from 'next/link'
import { Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'
import { PLAN_TEMPLATE_CATEGORY_OPTIONS } from '@/lib/validation/plan-schemas'
import type { PlanTemplateCategory } from '@ogun/db/schema'
import { listPlansAction } from '@/app/(app)/planlar/actions'
import { UseTemplateButton } from './use-template-button'

// GitHub issue #27 / Prompt 5.5, GÖREV 1 — "Şablon kütüphanesi
// (/planlar/sablonlar). Kategori filtreli kart görünümü. Her şablonda: ad,
// kalori, makro dağılımı, kaç kez kullanıldı."
//
// isTemplate=true olan diet_plans satırları ZATEN "şablon" (roadmap'in kendi
// tanımı: "plan_templates aslında diet_plans'ın isTemplate=true hali", ayrı
// bir tablo YOK, bkz. schema/plans.ts) — bu sayfa SADECE listPlansAction'ı
// isTemplate:true filtresiyle çağırıyor, yeni bir sorgu YAZMIYOR.
export default async function TemplateLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ kategori?: string }>
}) {
  const { kategori } = await searchParams
  const category =
    kategori && PLAN_TEMPLATE_CATEGORY_OPTIONS.some((o) => o.value === kategori)
      ? (kategori as PlanTemplateCategory)
      : undefined

  const result = await listPlansAction({ isTemplate: true, templateCategory: category })
  const templates = result.success && result.data ? result.data : []

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Şablon kütüphanesi</h1>
        <p className="text-sm text-muted-foreground">
          Sık kullandığınız plan yapılarını şablon olarak saklayın, danışanlar için hızlıca
          çoğaltın.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryFilterLink label="Tümü" href="/planlar/sablonlar" active={!category} />
        {PLAN_TEMPLATE_CATEGORY_OPTIONS.map((option) => (
          <CategoryFilterLink
            key={option.value}
            label={option.label}
            href={`/planlar/sablonlar?kategori=${option.value}`}
            active={category === option.value}
          />
        ))}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Henüz şablon yok"
          description='Bir plan editöründeyken üst çubuktaki "Şablona dönüştür" butonuyla ilk şablonunuzu oluşturun.'
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const macros = template.targetMacros
            return (
              <Card key={template.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{template.name}</span>
                    {template.templateCategory && (
                      <Badge variant="secondary" className="shrink-0">
                        {PLAN_TEMPLATE_CATEGORY_OPTIONS.find(
                          (o) => o.value === template.templateCategory,
                        )?.label ?? template.templateCategory}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {template.targetKcal !== null && (
                      <Badge variant="outline">{template.targetKcal} kcal</Badge>
                    )}
                    {macros && typeof macros.proteinPct === 'number' && (
                      <Badge variant="outline">P {macros.proteinPct}%</Badge>
                    )}
                    {macros && typeof macros.carbPct === 'number' && (
                      <Badge variant="outline">K {macros.carbPct}%</Badge>
                    )}
                    {macros && typeof macros.fatPct === 'number' && (
                      <Badge variant="outline">Y {macros.fatPct}%</Badge>
                    )}
                    <Badge variant="outline">{template.templateUsageCount} kez kullanıldı</Badge>
                  </div>
                  <UseTemplateButton templateId={template.id} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CategoryFilterLink({
  label,
  href,
  active,
}: {
  label: string
  href: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </Link>
  )
}
