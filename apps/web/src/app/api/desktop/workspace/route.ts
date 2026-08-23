import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@ogun/db'
import {
  addAlternative,
  addItem,
  createAppointment,
  createClient,
  createPlan,
  getClientById,
  getClinicById,
  getAppointmentById,
  getPlanById,
  getPlanTree,
  listAppointmentsInRange,
  listAppointmentIntervalsInRange,
  listClients,
  listPlans,
  moveItem,
  removeAlternative,
  removeItem,
  reorderItems,
  updateItem,
  updateMeal,
  updatePlan,
} from '@ogun/db/queries'
import { requireClinic, UnauthenticatedError } from '@/lib/authz'
import { canAccessClientRecord } from '@/lib/client-access'
import { CURRENT_KVKK_CONSENT_VERSION } from '@/lib/validation/client-schemas'

export const dynamic = 'force-dynamic'

const mutationEnvelopeSchema = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum(['client.create', 'plan.create', 'appointment.create', 'plan.draft.replace']),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
})

const syncRequestSchema = z.object({
  mutations: z.array(mutationEnvelopeSchema).max(500),
})

const clientCreateSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).nullable().optional(),
  birthDate: z.string().date().nullable().optional(),
  kvkkConsentChecked: z.literal(true),
  explicitConsentChecked: z.literal(true),
})

const planCreateSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  targetKcal: z.number().int().min(500).max(10000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
})

const appointmentCreateSchema = z
  .object({
    id: z.string().min(1),
    clientId: z.string().min(1),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    type: z.enum(['ilk_görüşme', 'kontrol', 'online', 'ölçüm']),
    notes: z.string().max(5_000).nullable().optional(),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: 'Randevu bitişi başlangıçtan sonra olmalıdır.',
  })

const draftAlternativeSchema = z.object({
  id: z.string().min(1),
  foodId: z.string().nullable(),
  recipeId: z.string().nullable(),
  freeText: z.string().nullable(),
  amountGrams: z.number().positive(),
})

const draftItemSchema = z.object({
  id: z.string().min(1),
  mealId: z.string().min(1),
  foodId: z.string().nullable(),
  recipeId: z.string().nullable(),
  freeText: z.string().nullable(),
  amountGrams: z.number().positive(),
  note: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  isOptional: z.boolean(),
  alternatives: z.array(draftAlternativeSchema),
})

const planDraftReplaceSchema = z.object({
  planId: z.string().min(1),
  planName: z.string().trim().min(1).max(160),
  targetKcal: z.number().int().positive().nullable(),
  startDate: z.string().datetime().nullable(),
  endDate: z.string().datetime().nullable(),
  outputFormat: z.enum(['besin_listesi', 'değişim_listesi']),
  days: z.array(
    z.object({
      id: z.string().min(1),
      dayNumber: z.number().int().positive(),
      dayLabel: z.string().nullable(),
      meals: z.array(
        z.object({
          id: z.string().min(1),
          dayId: z.string().min(1),
          mealType: z.string(),
          time: z.string().nullable(),
          name: z.string().min(1),
          sortOrder: z.number().int().nonnegative(),
          items: z.array(draftItemSchema),
        }),
      ),
    }),
  ),
})

function isTemporaryId(id: string): boolean {
  return id.startsWith('temp-') || id.startsWith('local-')
}

async function reconcilePlanDraft(
  clinicId: string,
  payload: z.infer<typeof planDraftReplaceSchema>,
) {
  const serverTree = await getPlanTree(db, clinicId, payload.planId)
  if (!serverTree) throw new Error('Eşitlenecek plan bulunamadı.')

  await updatePlan(db, clinicId, payload.planId, {
    name: payload.planName,
    targetKcal: payload.targetKcal,
    startDate: payload.startDate ? new Date(payload.startDate) : null,
    endDate: payload.endDate ? new Date(payload.endDate) : null,
    outputFormat: payload.outputFormat,
  })

  const serverItems = new Map(
    serverTree.days.flatMap((day) =>
      day.meals.flatMap((meal) => meal.items.map(({ item }) => [item.id, item] as const)),
    ),
  )
  const draftRealItemIds = new Set(
    payload.days.flatMap((day) =>
      day.meals.flatMap((meal) =>
        meal.items.filter((item) => !isTemporaryId(item.id)).map((item) => item.id),
      ),
    ),
  )

  for (const serverItemId of serverItems.keys()) {
    if (!draftRealItemIds.has(serverItemId)) await removeItem(db, clinicId, serverItemId)
  }

  for (const day of payload.days) {
    for (const meal of day.meals) {
      if (isTemporaryId(meal.id)) continue
      await updateMeal(db, clinicId, meal.id, {
        name: meal.name,
        time: meal.time,
        sortOrder: meal.sortOrder,
      })
      const orderedIds: string[] = []
      for (const item of meal.items) {
        let itemId = item.id
        if (isTemporaryId(item.id)) {
          const created = await addItem(db, clinicId, meal.id, {
            foodId: item.foodId,
            recipeId: item.recipeId,
            freeText: item.freeText,
            amount: item.amountGrams,
            note: item.note,
            sortOrder: item.sortOrder,
            isOptional: item.isOptional,
          })
          itemId = created.id
        } else {
          const existing = serverItems.get(item.id)
          if (existing?.mealId !== meal.id) {
            await moveItem(db, clinicId, item.id, meal.id, item.sortOrder)
          }
          await updateItem(db, clinicId, item.id, {
            amount: item.amountGrams,
            note: item.note,
            sortOrder: item.sortOrder,
            isOptional: item.isOptional,
          })
        }
        orderedIds.push(itemId)

        const serverEntry = serverTree.days
          .flatMap((treeDay) => treeDay.meals)
          .flatMap((treeMeal) => treeMeal.items)
          .find(({ item: treeItem }) => treeItem.id === item.id)
        const draftRealAlternativeIds = new Set(
          item.alternatives
            .filter((alternative) => !isTemporaryId(alternative.id))
            .map((alternative) => alternative.id),
        )
        for (const alternative of serverEntry?.alternatives ?? []) {
          if (!draftRealAlternativeIds.has(alternative.id)) {
            await removeAlternative(db, clinicId, alternative.id)
          }
        }
        for (const [index, alternative] of item.alternatives.entries()) {
          if (!isTemporaryId(alternative.id)) continue
          await addAlternative(db, clinicId, itemId, {
            foodId: alternative.foodId,
            recipeId: alternative.recipeId,
            freeText: alternative.freeText,
            amount: alternative.amountGrams,
            sortOrder: index,
          })
        }
      }
      await reorderItems(db, clinicId, meal.id, orderedIds)
    }
  }
}

function unauthorized() {
  return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })
}

export async function GET() {
  try {
    const ctx = await requireClinic()
    const clinic = await getClinicById(db, ctx.scope.clinicId)
    if (!clinic) return NextResponse.json({ error: 'Klinik bulunamadı.' }, { status: 404 })

    const from = new Date()
    from.setFullYear(from.getFullYear() - 1)
    const to = new Date()
    to.setFullYear(to.getFullYear() + 2)

    const clientSummaries: Array<{ id: string }> = []
    let clientPage = 1
    let clientTotal = 0
    do {
      const result = await listClients(db, ctx.scope.clinicId, {
        page: clientPage,
        pageSize: 100,
        assignedDietitianId: ctx.role === 'dietitian' ? ctx.user.id : undefined,
      })
      clientSummaries.push(...result.rows)
      clientTotal = result.total
      clientPage += 1
    } while (clientSummaries.length < clientTotal)

    const [clientRows, planRows, appointmentRows] = await Promise.all([
      Promise.all(
        clientSummaries.map((summary) => getClientById(db, ctx.scope.clinicId, summary.id)),
      ).then((rows) => rows.filter((row) => row !== null)),
      listPlans(db, ctx.scope.clinicId, {
        visibleToDietitianId: ctx.role === 'dietitian' ? ctx.user.id : undefined,
      }),
      listAppointmentsInRange(db, ctx.scope.clinicId, {
        from,
        to,
        visibleToDietitianId: ctx.role === 'dietitian' ? ctx.user.id : undefined,
      }),
    ])

    return NextResponse.json({
      version: 1,
      capturedAt: new Date().toISOString(),
      clinic: { id: clinic.id, name: clinic.name },
      clients: clientRows,
      plans: planRows,
      appointments: appointmentRows,
    })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorized()
    throw error
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireClinic()
    const parsed = syncRequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Geçersiz veri.' },
        { status: 400 },
      )
    }

    const appliedIds: string[] = []
    const idMap: Record<string, string> = {}

    for (const mutation of parsed.data.mutations) {
      try {
        if (mutation.kind === 'client.create') {
          const payload = clientCreateSchema.parse(mutation.payload)
          const existing = await getClientById(db, ctx.scope.clinicId, payload.id)
          const created =
            existing ??
            (await createClient(db, ctx.scope.clinicId, {
              id: payload.id,
              firstName: payload.firstName,
              lastName: payload.lastName,
              phone: payload.phone ?? null,
              birthDate: payload.birthDate ?? null,
              kvkkConsentAt: new Date(mutation.createdAt),
              kvkkConsentVersion: CURRENT_KVKK_CONSENT_VERSION,
              explicitConsentAt: new Date(mutation.createdAt),
              assignedDietitianId: ctx.role === 'dietitian' ? ctx.user.id : null,
            }))
          idMap[payload.id] = created.id
        }

        if (mutation.kind === 'plan.create') {
          const payload = planCreateSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          const client = await getClientById(db, ctx.scope.clinicId, clientId)
          if (!canAccessClientRecord(client, { role: ctx.role, userId: ctx.user.id })) {
            throw new Error('Plan danışanına erişim izniniz yok.')
          }
          const existing = await getPlanById(db, ctx.scope.clinicId, payload.id)
          const created =
            existing ??
            (await createPlan(db, ctx.scope.clinicId, ctx.user.id, {
              id: payload.id,
              clientId,
              name: payload.name,
              targetKcal: payload.targetKcal ?? null,
              notes: payload.notes ?? null,
              status: 'taslak',
            }))
          idMap[payload.id] = created.id
        }

        if (mutation.kind === 'appointment.create') {
          const payload = appointmentCreateSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          const client = await getClientById(db, ctx.scope.clinicId, clientId)
          if (!canAccessClientRecord(client, { role: ctx.role, userId: ctx.user.id })) {
            throw new Error('Randevu danışanına erişim izniniz yok.')
          }
          const existing = await getAppointmentById(db, ctx.scope.clinicId, payload.id)
          const startsAt = new Date(payload.startsAt)
          const endsAt = new Date(payload.endsAt)
          if (!existing) {
            const intervals = await listAppointmentIntervalsInRange(db, ctx.scope.clinicId, {
              from: startsAt,
              to: endsAt,
            })
            if (
              intervals.some(
                (interval) =>
                  interval.dietitianId === ctx.user.id &&
                  interval.status !== 'iptal' &&
                  interval.startsAt < endsAt &&
                  interval.endsAt > startsAt,
              )
            ) {
              throw new Error(
                'Bu saatte başka bir randevu bulunuyor. Yerel kayıt cihazda bekletildi.',
              )
            }
          }
          const created =
            existing ??
            (await createAppointment(db, ctx.scope.clinicId, {
              id: payload.id,
              clientId,
              dietitianId: ctx.user.id,
              startsAt,
              endsAt,
              type: payload.type,
              notes: payload.notes ?? null,
            }))
          if (created) idMap[payload.id] = created.id
        }

        if (mutation.kind === 'plan.draft.replace') {
          const payload = planDraftReplaceSchema.parse(mutation.payload)
          const plan = await getPlanTree(db, ctx.scope.clinicId, payload.planId)
          const client = plan?.plan.clientId
            ? await getClientById(db, ctx.scope.clinicId, plan.plan.clientId)
            : null
          if (!plan || !canAccessClientRecord(client, { role: ctx.role, userId: ctx.user.id })) {
            throw new Error('Planı eşitleme izniniz yok.')
          }
          await reconcilePlanDraft(ctx.scope.clinicId, payload)
        }

        appliedIds.push(mutation.id)
      } catch (error) {
        return NextResponse.json({
          appliedIds,
          idMap,
          failedMutationId: mutation.id,
          error: error instanceof Error ? error.message : 'Yerel kayıt eşitlenemedi.',
        })
      }
    }

    return NextResponse.json({ appliedIds, idMap })
  } catch (error) {
    if (error instanceof UnauthenticatedError) return unauthorized()
    throw error
  }
}
