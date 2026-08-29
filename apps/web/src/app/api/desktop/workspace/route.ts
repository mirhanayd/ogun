import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@ogun/db'
import {
  addAlternative,
  addDay,
  addItem,
  addMeal,
  createAppointment,
  createClient,
  createGoal,
  createLabResult,
  createMeasurement,
  createPayment,
  createPlan,
  getClientById,
  getDesktopClinicalWorkspace,
  getDesktopMutationReceipt,
  getGoalClientId,
  getClinicById,
  getAppointmentById,
  getLabResultClientId,
  getMeasurementClientId,
  getPaymentClientId,
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
  updateClientGeneralInfo,
  updateItem,
  updateMeal,
  updatePlan,
  upsertClientHealth,
  recordDesktopMutationReceipt,
} from '@ogun/db/queries'
import { requireClinic, UnauthenticatedError } from '@/lib/authz'
import { canAccessClientRecord } from '@/lib/client-access'
import { CURRENT_KVKK_CONSENT_VERSION } from '@/lib/validation/client-schemas'

export const dynamic = 'force-dynamic'

const mutationEnvelopeSchema = z.object({
  id: z.string().min(1).max(160),
  kind: z.enum([
    'client.create',
    'client.update',
    'anamnesis.upsert',
    'measurement.create',
    'goal.create',
    'labResult.create',
    'payment.create',
    'plan.create',
    'plan.update',
    'appointment.create',
    'plan.draft.replace',
  ]),
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
  sex: z.enum(['male', 'female']).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  occupation: z.string().trim().max(120).nullable().optional(),
  referralSource: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(4_000).nullable().optional(),
  kvkkConsentChecked: z.literal(true),
  explicitConsentChecked: z.literal(true),
})

const clientUpdateSchema = z.object({
  clientId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: z.string().date().nullable().optional(),
  sex: z.enum(['male', 'female']).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  occupation: z.string().trim().max(120).nullable().optional(),
  referralSource: z.string().trim().max(120).nullable().optional(),
  notes: z.string().max(4_000).nullable().optional(),
  status: z.enum(['aktif', 'pasif', 'arşiv']),
  smsConsentChecked: z.boolean().optional(),
})

const allergenSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  severity: z.enum(['hafif', 'orta', 'şiddetli']).nullable(),
  note: z.string().trim().max(500).nullable(),
})

const anamnesisSchema = z.object({
  clientId: z.string().min(1),
  conditions: z.array(z.string().trim().min(1).max(500)).max(100),
  medications: z.array(z.string().trim().min(1).max(500)).max(100),
  allergies: z.array(allergenSchema).max(50),
  intolerances: z.array(allergenSchema).max(50),
  surgeries: z.string().max(2_000).nullable(),
  familyHistory: z.string().max(2_000).nullable(),
  smokingStatus: z.string().max(200).nullable(),
  alcoholUse: z.string().max(200).nullable(),
  mealsPerDay: z.number().int().min(1).max(15).nullable(),
  eatingOutFrequency: z.string().max(200).nullable(),
  waterIntakeMl: z.number().int().min(0).max(10_000).nullable(),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).nullable(),
  activityNotes: z.string().max(2_000).nullable(),
  sleepHours: z.number().int().min(0).max(24).nullable(),
  sleepQuality: z.string().max(200).nullable(),
  bowelHabits: z.string().max(1_000).nullable(),
})

const optionalPositiveNumber = z.number().positive().nullable().optional()
const measurementCreateSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  measuredAt: z.string().datetime(),
  source: z.enum(['manuel', 'inbody', 'tanita', 'accuniq']),
  weightKg: z.number().positive().max(500),
  heightCm: optionalPositiveNumber,
  waistCm: optionalPositiveNumber,
  hipCm: optionalPositiveNumber,
  neckCm: optionalPositiveNumber,
  armCm: optionalPositiveNumber,
  thighCm: optionalPositiveNumber,
  chestCm: optionalPositiveNumber,
  bodyFatPct: optionalPositiveNumber,
  bodyFatKg: optionalPositiveNumber,
  leanMassKg: optionalPositiveNumber,
  muscleMassKg: optionalPositiveNumber,
  totalBodyWaterL: optionalPositiveNumber,
  visceralFatLevel: z.number().int().positive().nullable().optional(),
  bmrKcal: z.number().int().positive().nullable().optional(),
  phaseAngle: optionalPositiveNumber,
  notes: z.string().max(2_000).nullable().optional(),
})

const goalCreateSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  type: z.enum(['kilo', 'yağ_oranı', 'çevre']),
  targetValue: z.number().positive(),
  targetDate: z.string().date().nullable().optional(),
  startValue: z.number().positive(),
  startedAt: z.string().datetime(),
})

const labResultCreateSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  testedAt: z.string().datetime(),
  analyte: z.string().trim().min(1).max(120),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(30),
  refMin: z.number().finite().nullable().optional(),
  refMax: z.number().finite().nullable().optional(),
  labName: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(2_000).nullable().optional(),
})

const paymentCreateSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  method: z.enum(['nakit', 'kart', 'havale', 'online']),
  paidAt: z.string().datetime(),
  notes: z.string().max(500).nullable().optional(),
})

const planCreateSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  targetKcal: z.number().int().min(500).max(10000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  skeleton: z
    .object({
      days: z
        .array(
          z.object({
            id: z.string().min(1).max(160),
            dayNumber: z.number().int().positive(),
            dayLabel: z.string().nullable(),
            meals: z
              .array(
                z.object({
                  id: z.string().min(1).max(160),
                  mealType: z.enum(['kahvaltı', 'ara1', 'öğle', 'ara2', 'akşam', 'gece']),
                  time: z.string().nullable(),
                  name: z.string().trim().min(1).max(120),
                  sortOrder: z.number().int().nonnegative(),
                }),
              )
              .max(12),
          }),
        )
        .max(31),
    })
    .optional(),
})

const planUpdateSchema = z.object({
  planId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  targetKcal: z.number().int().min(500).max(10000).nullable().optional(),
  notes: z.string().max(20_000).nullable().optional(),
  status: z.enum(['taslak', 'aktif', 'arşiv']),
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
  const serverMealIds = new Set(
    serverTree.days.flatMap((day) => day.meals.map(({ meal }) => meal.id)),
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
      // Yeni çevrimdışı planların yerel öğün kimlikleri plan.create
      // sırasında sunucuda aynen oluşturulur. Yalnızca henüz karşılığı
      // bulunmayan geçici öğünleri atla.
      if (isTemporaryId(meal.id) && !serverMealIds.has(meal.id)) continue
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

    const clinicalWorkspace = await getDesktopClinicalWorkspace(
      db,
      ctx.scope.clinicId,
      clientRows.map((client) => client.id),
    )

    return NextResponse.json({
      version: 2,
      capturedAt: new Date().toISOString(),
      clinic: { id: clinic.id, name: clinic.name },
      clients: clientRows,
      ...clinicalWorkspace,
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

    const requireAccessibleClient = async (clientId: string, operation: string) => {
      const client = await getClientById(db, ctx.scope.clinicId, clientId)
      if (!canAccessClientRecord(client, { role: ctx.role, userId: ctx.user.id })) {
        throw new Error(`${operation} için danışana erişim izniniz yok.`)
      }
      return client
    }

    for (const mutation of parsed.data.mutations) {
      try {
        const receipt = await getDesktopMutationReceipt(
          db,
          ctx.scope.clinicId,
          ctx.user.id,
          mutation.id,
        )
        if (receipt) {
          Object.assign(idMap, receipt.result.idMap)
          appliedIds.push(mutation.id)
          continue
        }
        const idMapBeforeMutation = new Set(Object.keys(idMap))
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
              sex: payload.sex ?? null,
              email: payload.email ?? null,
              occupation: payload.occupation ?? null,
              referralSource: payload.referralSource ?? null,
              notes: payload.notes ?? null,
              kvkkConsentAt: new Date(mutation.createdAt),
              kvkkConsentVersion: CURRENT_KVKK_CONSENT_VERSION,
              explicitConsentAt: new Date(mutation.createdAt),
              assignedDietitianId: ctx.role === 'dietitian' ? ctx.user.id : null,
            }))
          idMap[payload.id] = created.id
        }

        if (mutation.kind === 'client.update') {
          const payload = clientUpdateSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          await requireAccessibleClient(clientId, 'Danışan güncellemesi')
          await updateClientGeneralInfo(db, ctx.scope.clinicId, clientId, {
            firstName: payload.firstName,
            lastName: payload.lastName,
            birthDate: payload.birthDate ?? null,
            sex: payload.sex ?? null,
            phone: payload.phone ?? null,
            email: payload.email ?? null,
            occupation: payload.occupation ?? null,
            referralSource: payload.referralSource ?? null,
            notes: payload.notes ?? null,
            status: payload.status,
            ...(payload.smsConsentChecked !== undefined
              ? { smsConsentAt: payload.smsConsentChecked ? new Date(mutation.createdAt) : null }
              : {}),
          })
        }

        if (mutation.kind === 'anamnesis.upsert') {
          const payload = anamnesisSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          await requireAccessibleClient(clientId, 'Anamnez kaydı')
          await upsertClientHealth(db, ctx.scope.clinicId, clientId, payload)
        }

        if (mutation.kind === 'measurement.create') {
          const payload = measurementCreateSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          await requireAccessibleClient(clientId, 'Ölçüm kaydı')
          const existingClientId = await getMeasurementClientId(db, payload.id)
          if (existingClientId && existingClientId !== clientId) {
            throw new Error('Ölçüm kimliği çakışıyor.')
          }
          if (!existingClientId) {
            await createMeasurement(db, ctx.scope.clinicId, clientId, {
              ...payload,
              measuredAt: new Date(payload.measuredAt),
              recordedBy: ctx.user.id,
            })
          }
          idMap[payload.id] = payload.id
        }

        if (mutation.kind === 'goal.create') {
          const payload = goalCreateSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          await requireAccessibleClient(clientId, 'Hedef kaydı')
          const existingClientId = await getGoalClientId(db, payload.id)
          if (existingClientId && existingClientId !== clientId) {
            throw new Error('Hedef kimliği çakışıyor.')
          }
          if (!existingClientId) {
            await createGoal(db, ctx.scope.clinicId, clientId, {
              ...payload,
              startedAt: new Date(payload.startedAt),
            })
          }
          idMap[payload.id] = payload.id
        }

        if (mutation.kind === 'labResult.create') {
          const payload = labResultCreateSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          await requireAccessibleClient(clientId, 'Laboratuvar kaydı')
          const existingClientId = await getLabResultClientId(db, payload.id)
          if (existingClientId && existingClientId !== clientId) {
            throw new Error('Laboratuvar sonucu kimliği çakışıyor.')
          }
          if (!existingClientId) {
            await createLabResult(db, ctx.scope.clinicId, clientId, {
              ...payload,
              testedAt: new Date(payload.testedAt),
              recordedBy: ctx.user.id,
            })
          }
          idMap[payload.id] = payload.id
        }

        if (mutation.kind === 'payment.create') {
          const payload = paymentCreateSchema.parse(mutation.payload)
          const clientId = idMap[payload.clientId] ?? payload.clientId
          await requireAccessibleClient(clientId, 'Ödeme kaydı')
          const existingClientId = await getPaymentClientId(db, payload.id)
          if (existingClientId && existingClientId !== clientId) {
            throw new Error('Ödeme kimliği çakışıyor.')
          }
          if (!existingClientId) {
            await createPayment(db, ctx.scope.clinicId, {
              id: payload.id,
              clientId,
              amount: payload.amount.toFixed(2),
              method: payload.method,
              paidAt: new Date(payload.paidAt),
              notes: payload.notes ?? null,
            })
          }
          idMap[payload.id] = payload.id
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
          if (payload.skeleton) {
            const tree = await getPlanTree(db, ctx.scope.clinicId, created.id)
            const existingDayIds = new Set(tree?.days.map(({ day }) => day.id) ?? [])
            const existingMealIds = new Set(
              tree?.days.flatMap((day) => day.meals.map(({ meal }) => meal.id)) ?? [],
            )
            for (const day of payload.skeleton.days) {
              if (!existingDayIds.has(day.id)) {
                await addDay(db, ctx.scope.clinicId, created.id, {
                  id: day.id,
                  dayNumber: day.dayNumber,
                  dayLabel: day.dayLabel,
                })
              }
              for (const meal of day.meals) {
                if (existingMealIds.has(meal.id)) continue
                await addMeal(db, ctx.scope.clinicId, day.id, {
                  id: meal.id,
                  mealType: meal.mealType,
                  time: meal.time,
                  name: meal.name,
                  sortOrder: meal.sortOrder,
                })
              }
            }
          }
        }

        if (mutation.kind === 'plan.update') {
          const payload = planUpdateSchema.parse(mutation.payload)
          const plan = await getPlanById(db, ctx.scope.clinicId, payload.planId)
          const client = plan?.clientId
            ? await getClientById(db, ctx.scope.clinicId, plan.clientId)
            : null
          if (!plan || !canAccessClientRecord(client, { role: ctx.role, userId: ctx.user.id })) {
            throw new Error('Planı güncelleme izniniz yok.')
          }
          await updatePlan(db, ctx.scope.clinicId, payload.planId, {
            name: payload.name,
            targetKcal: payload.targetKcal ?? null,
            notes: payload.notes ?? null,
            status: payload.status,
          })
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

        const receiptIdMap = Object.fromEntries(
          Object.entries(idMap).filter(([key]) => !idMapBeforeMutation.has(key)),
        )
        await recordDesktopMutationReceipt(db, {
          clinicId: ctx.scope.clinicId,
          userId: ctx.user.id,
          mutationId: mutation.id,
          kind: mutation.kind,
          idMap: receiptIdMap,
        })
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
