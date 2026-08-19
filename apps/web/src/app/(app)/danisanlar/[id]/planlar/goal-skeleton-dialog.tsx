'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Target } from 'lucide-react'
import { toast } from 'sonner'
import { toastActionError } from '@/lib/action-toast'
import { distributeCalories } from '@ogun/nutrition-core'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MACRO_DISTRIBUTION_OPTIONS,
  PLAN_MEAL_TYPE_OPTIONS,
  type MacroDistributionPresetValue,
} from '@/lib/validation/plan-schemas'
import type { PlanMealType } from '@ogun/db/schema'
import { generatePlanSkeletonAction } from '@/app/(app)/planlar/actions'

// GitHub issue #27 / Prompt 5.5, GÖREV 4 — "hedeften plan iskeleti"
// sihirbazı. TEE hesabı BURADA yapılmıyor (bkz. planlar-tab.tsx: TEE zaten
// sunucuda nutrition-core/energy-requirement.ts ile hesaplanıp
// `defaultTargetKcal` olarak buraya prop geçiliyor) — bu bileşen sadece
// diyetisyenin bu öneriyi GÖRÜP değiştirebileceği, makro dağılımını ve öğün
// sayısını seçtiği son adımı taşıyor.
//
// Her öğün türüne SABİT bir "tipik ağırlık" atanmış (ana öğünler ara
// öğünlerden büyük pay alır) — bu bir ÜRÜN KARARI, roadmap'in kendisi
// spesifik bir dağılım tarifi vermiyor ("öğünlere kalori dağıt" diyor,
// NASIL'ı söylemiyor). Sadece ÖNİZLEME amaçlı: hiçbir yerde kalıcı
// olarak saklanmıyor (bkz. actions.ts generatePlanSkeletonAction notu —
// plan_meals'ta kcal hedefi tutan bir sütun YOK, "boş iskelet" kuralı
// gereği).
const MEAL_WEIGHTS: Record<PlanMealType, number> = {
  kahvaltı: 3,
  ara1: 1,
  öğle: 3.5,
  ara2: 1,
  akşam: 3,
  gece: 0.5,
}

export function GoalSkeletonDialog({
  clientId,
  defaultTargetKcal,
  open,
  onOpenChange,
}: {
  clientId: string
  defaultTargetKcal: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [name, setName] = useState('Hedeften oluşturulan plan')
  const [targetKcal, setTargetKcal] = useState<number | ''>(defaultTargetKcal ?? '')
  const [distribution, setDistribution] = useState<MacroDistributionPresetValue>('balanced')
  const [customProtein, setCustomProtein] = useState(25)
  const [customCarb, setCustomCarb] = useState(45)
  const [customFat, setCustomFat] = useState(30)
  const [selectedMeals, setSelectedMeals] = useState<PlanMealType[]>([
    'kahvaltı',
    'öğle',
    'akşam',
  ])
  const [isPending, startTransition] = useTransition()

  const orderedSelectedMeals = useMemo(
    () => PLAN_MEAL_TYPE_OPTIONS.filter((o) => selectedMeals.includes(o.value)),
    [selectedMeals],
  )

  const preview = useMemo(() => {
    if (typeof targetKcal !== 'number' || targetKcal <= 0 || orderedSelectedMeals.length === 0) {
      return null
    }
    const weights = orderedSelectedMeals.map((o) => MEAL_WEIGHTS[o.value])
    const kcalPerMeal = distributeCalories(targetKcal, weights)
    return orderedSelectedMeals.map((o, index) => ({
      label: o.label,
      kcal: kcalPerMeal[index] ?? 0,
    }))
  }, [targetKcal, orderedSelectedMeals])

  const customSum = customProtein + customCarb + customFat

  function toggleMeal(mealType: PlanMealType, checked: boolean) {
    setSelectedMeals((prev) =>
      checked ? [...prev, mealType] : prev.filter((m) => m !== mealType),
    )
  }

  function handleSubmit() {
    if (typeof targetKcal !== 'number' || targetKcal <= 0) {
      toast.error('Geçerli bir hedef kalori girin.')
      return
    }
    if (orderedSelectedMeals.length === 0) {
      toast.error('En az bir öğün seçin.')
      return
    }
    if (distribution === 'custom' && Math.abs(customSum - 100) > 0.5) {
      toast.error(`Makro yüzdeleri toplamı %100 olmalıdır (şu an %${customSum}).`)
      return
    }

    startTransition(async () => {
      const result = await generatePlanSkeletonAction({
        clientId,
        name,
        targetKcal,
        macroDistribution: distribution,
        customMacros:
          distribution === 'custom'
            ? { proteinPct: customProtein, carbPct: customCarb, fatPct: customFat }
            : undefined,
        mealTypes: orderedSelectedMeals.map((o) => o.value),
      })
      if (!result.success || !result.data) {
        toastActionError(result.error ?? 'Plan iskeleti oluşturulamadı.', 'Hedef kalori ve öğün seçimini gözden geçirip tekrar deneyin.')
        return
      }
      onOpenChange(false)
      router.push(`/danisanlar/${clientId}/planlar/${result.data.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hedeften plan iskeleti oluştur</DialogTitle>
          <DialogDescription>
            Danışanın enerji ihtiyacından yola çıkan BOŞ bir plan iskeleti oluşturur — gün ve
            öğünler hazır gelir, besin kalemleri eklenmez; onları siz doldurursunuz.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skeleton-name">Plan adı</Label>
            <Input id="skeleton-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skeleton-kcal">Hedef kalori</Label>
            <Input
              id="skeleton-kcal"
              type="number"
              min={0}
              value={targetKcal}
              onChange={(e) =>
                setTargetKcal(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
            {defaultTargetKcal !== null ? (
              <p className="text-xs text-muted-foreground">
                Danışanın profilinden hesaplanan TEE önerisi: {defaultTargetKcal} kcal.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                TEE hesaplamak için danışanın yaş/cinsiyet/kilo/boy/aktivite bilgileri eksik —
                hedefi manuel girin.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="skeleton-distribution">Makro dağılımı</Label>
            <Select
              value={distribution}
              onValueChange={(value) => setDistribution(value as MacroDistributionPresetValue)}
            >
              <SelectTrigger id="skeleton-distribution">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MACRO_DISTRIBUTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {distribution === 'custom' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-protein" className="text-xs">
                  Protein %
                </Label>
                <Input
                  id="custom-protein"
                  type="number"
                  min={0}
                  max={100}
                  value={customProtein}
                  onChange={(e) => setCustomProtein(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-carb" className="text-xs">
                  Karbonhidrat %
                </Label>
                <Input
                  id="custom-carb"
                  type="number"
                  min={0}
                  max={100}
                  value={customCarb}
                  onChange={(e) => setCustomCarb(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-fat" className="text-xs">
                  Yağ %
                </Label>
                <Input
                  id="custom-fat"
                  type="number"
                  min={0}
                  max={100}
                  value={customFat}
                  onChange={(e) => setCustomFat(Number(e.target.value))}
                />
              </div>
              {Math.abs(customSum - 100) > 0.5 && (
                <p className="col-span-3 text-xs text-destructive">
                  Toplam %100 olmalı (şu an %{customSum}).
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Öğünler</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLAN_MEAL_TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={selectedMeals.includes(option.value)}
                    onCheckedChange={(checked) => toggleMeal(option.value, checked === true)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          {preview && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                Önizleme (yalnızca öğün kabukları oluşturulur, kalori bilgisi kaydedilmez)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.map((meal) => (
                  <Badge key={meal.label} variant="outline">
                    {meal.label}: {meal.kcal} kcal
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Vazgeç
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} className="gap-1.5">
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Target className="size-3.5" />
            )}
            İskeleti oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
