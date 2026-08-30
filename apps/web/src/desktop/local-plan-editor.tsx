/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo } from 'react'
import type { PlanTree } from '@ogun/db/queries'
import type { DomainEntity, OgunRepositories } from '@/data/repositories'
import { calculateAge } from '@/lib/client-age'
import { configurePlanEditorPersistence } from '@/screens/plan-editor-persistence'
import { PlanEditor } from '@/app/(app)/danisanlar/[id]/planlar/[planId]/plan-editor'
import { usePlanEditorStore } from '@/app/(app)/danisanlar/[id]/planlar/[planId]/plan-editor-store'

function defaultDraft(plan: DomainEntity) {
  const dayId = crypto.randomUUID()
  const mealNames = [['kahvaltı', 'Kahvaltı'], ['ara1', 'Ara Öğün 1'], ['öğle', 'Öğle'], ['ara2', 'Ara Öğün 2'], ['akşam', 'Akşam'], ['gece', 'Gece']] as const
  return { planId: plan.id, planName: String(plan.name ?? 'Beslenme planı'), targetKcal: typeof plan.targetKcal === 'number' ? plan.targetKcal : null, startDate: plan.startDate ?? null, endDate: plan.endDate ?? null, outputFormat: plan.outputFormat ?? 'besin_listesi', days: [{ id: dayId, dayNumber: 1, dayLabel: null, meals: mealNames.map(([mealType, name], sortOrder) => ({ id: crypto.randomUUID(), dayId, mealType, time: null, name, sortOrder, items: [] })) }] }
}

function treeFromDraft(plan: DomainEntity, draft: ReturnType<typeof defaultDraft>): PlanTree {
  return {
    plan: plan as PlanTree['plan'],
    days: draft.days.map((day) => ({
      day: { id: day.id, planId: plan.id, dayNumber: day.dayNumber, dayLabel: day.dayLabel, notes: null } as PlanTree['days'][number]['day'],
      meals: day.meals.map((meal) => ({
        meal: { ...meal, dayId: day.id, notes: null } as PlanTree['days'][number]['meals'][number]['meal'],
        items: meal.items.map((item: any) => ({
          item: { ...item, amount: item.amountGrams, createdAt: new Date(), updatedAt: new Date() },
          alternatives: (item.alternatives ?? []).map((alternative: any) => ({ ...alternative, amount: alternative.amountGrams, planItemId: item.id, createdAt: new Date(), updatedAt: new Date() })),
        })) as PlanTree['days'][number]['meals'][number]['items'],
      })),
    })),
  }
}

export function LocalPlanEditor({ plan, client, repository }: { plan: DomainEntity; client: DomainEntity; repository: OgunRepositories['plans'] }) {
  const draft = useMemo(() => (plan.draft && typeof plan.draft === 'object' ? plan.draft : defaultDraft(plan)) as ReturnType<typeof defaultDraft>, [plan])
  const persist = () => {
    queueMicrotask(() => {
      const state = usePlanEditorStore.getState()
      void repository.replaceDraft(plan.id, { planId: plan.id, planName: state.planName, targetKcal: state.targetKcal, startDate: state.startDate?.toISOString() ?? null, endDate: state.endDate?.toISOString() ?? null, outputFormat: state.outputFormat, days: state.days })
    })
  }
  const success = (data?: unknown) => { persist(); return Promise.resolve({ success: true, ...(data === undefined ? {} : { data }) }) }
  configurePlanEditorPersistence({
    updatePlanAction: async (_id, patch) => { await repository.upsert({ ...plan, ...patch, id: plan.id }); persist(); return { success: true } },
    updateMealAction: () => success(),
    addItemAction: () => success({ id: crypto.randomUUID() }),
    updateItemAction: () => success(),
    removeItemAction: () => success(),
    reorderItemsAction: () => success(),
    moveItemAction: () => success(),
    addAlternativeAction: () => success({ id: crypto.randomUUID() }),
    removeAlternativeAction: () => success(),
    insertSavedMealAction: () => Promise.resolve({ success: false, error: 'Kayıtlı öğün ekleme çevrimdışıyken kullanılamıyor.' }),
    createSavedMealAction: () => Promise.resolve({ success: false, error: 'Öğün kütüphanesi çevrimdışıyken kullanılamıyor.' }),
    buildExchangeEquivalentsPreviewAction: () => Promise.resolve({ success: true, data: [] }),
    listFoodsForExchangeGroupAction: () => Promise.resolve({ success: true, data: [] }),
  })
  return <PlanEditor planId={plan.id} clientId={client.id} planName={String(plan.name ?? draft.planName)} startDate={plan.startDate ? new Date(String(plan.startDate)) : null} endDate={plan.endDate ? new Date(String(plan.endDate)) : null} targetKcal={typeof plan.targetKcal === 'number' ? plan.targetKcal : null} outputFormat={plan.outputFormat === 'değişim_listesi' ? 'değişim_listesi' : 'besin_listesi'} tree={treeFromDraft(plan, draft)} clientSex={client.sex === 'male' || client.sex === 'female' ? client.sex : null} clientAge={calculateAge(typeof client.birthDate === 'string' ? client.birthDate : null)} allergies={null} intolerances={null} pdfDefaultDensity="spacious" pdfDefaultShowCalories clientName={`${String(client.firstName ?? '')} ${String(client.lastName ?? '')}`.trim()} clientPhone={typeof client.phone === 'string' ? client.phone : null} clientEmail={typeof client.email === 'string' ? client.email : null} whatsappTemplate={null} />
}
/* eslint-disable @typescript-eslint/no-explicit-any */
