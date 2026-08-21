import { and, eq } from 'drizzle-orm'
import {
  appointments,
  clientGoals,
  clientPackages,
  clients,
  dietPlans,
  documents,
  labResults,
  planDays,
  planItemAlternatives,
  planItems,
  planMeals,
  planShares,
} from '../schema'
import type { Database } from '../client'

// Dolaylı kaynak kimliklerini (planId/dayId/mealId/...) ait oldukları
// danışana çözer. `undefined` kaynak/klinik eşleşmedi, `null` ise klinik
// şablonu gibi danışansız bir plan demektir.
export async function clientIdForPlan(db: Database, clinicId: string, planId: string) {
  const [row] = await db
    .select({ clientId: dietPlans.clientId })
    .from(dietPlans)
    .where(and(eq(dietPlans.id, planId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForPlanDay(db: Database, clinicId: string, dayId: string) {
  const [row] = await db
    .select({ clientId: dietPlans.clientId })
    .from(planDays)
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planDays.id, dayId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForPlanMeal(db: Database, clinicId: string, mealId: string) {
  const [row] = await db
    .select({ clientId: dietPlans.clientId })
    .from(planMeals)
    .innerJoin(planDays, eq(planDays.id, planMeals.dayId))
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planMeals.id, mealId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForPlanItem(db: Database, clinicId: string, itemId: string) {
  const [row] = await db
    .select({ clientId: dietPlans.clientId })
    .from(planItems)
    .innerJoin(planMeals, eq(planMeals.id, planItems.mealId))
    .innerJoin(planDays, eq(planDays.id, planMeals.dayId))
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planItems.id, itemId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForPlanAlternative(db: Database, clinicId: string, alternativeId: string) {
  const [row] = await db
    .select({ clientId: dietPlans.clientId })
    .from(planItemAlternatives)
    .innerJoin(planItems, eq(planItems.id, planItemAlternatives.itemId))
    .innerJoin(planMeals, eq(planMeals.id, planItems.mealId))
    .innerJoin(planDays, eq(planDays.id, planMeals.dayId))
    .innerJoin(dietPlans, eq(dietPlans.id, planDays.planId))
    .where(and(eq(planItemAlternatives.id, alternativeId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForDocument(db: Database, clinicId: string, documentId: string) {
  const [row] = await db
    .select({ clientId: documents.clientId })
    .from(documents)
    .innerJoin(clients, eq(clients.id, documents.clientId))
    .where(and(eq(documents.id, documentId), eq(clients.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForLabResult(db: Database, clinicId: string, labResultId: string) {
  const [row] = await db
    .select({ clientId: labResults.clientId })
    .from(labResults)
    .innerJoin(clients, eq(clients.id, labResults.clientId))
    .where(and(eq(labResults.id, labResultId), eq(clients.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForGoal(db: Database, clinicId: string, goalId: string) {
  const [row] = await db
    .select({ clientId: clientGoals.clientId })
    .from(clientGoals)
    .innerJoin(clients, eq(clients.id, clientGoals.clientId))
    .where(and(eq(clientGoals.id, goalId), eq(clients.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForPlanShare(db: Database, clinicId: string, shareId: string) {
  const [row] = await db
    .select({ clientId: dietPlans.clientId })
    .from(planShares)
    .innerJoin(dietPlans, eq(dietPlans.id, planShares.planId))
    .where(and(eq(planShares.id, shareId), eq(dietPlans.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForClientPackage(db: Database, clinicId: string, clientPackageId: string) {
  const [row] = await db
    .select({ clientId: clientPackages.clientId })
    .from(clientPackages)
    .innerJoin(clients, eq(clients.id, clientPackages.clientId))
    .where(and(eq(clientPackages.id, clientPackageId), eq(clients.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}

export async function clientIdForAppointment(db: Database, clinicId: string, appointmentId: string) {
  const [row] = await db
    .select({ clientId: appointments.clientId })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.clinicId, clinicId)))
    .limit(1)
  return row?.clientId
}
