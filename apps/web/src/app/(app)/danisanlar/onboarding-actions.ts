'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { createSampleClientAndPlan, createSamplePlanForClient, type SampleClientAndPlan } from '@ogun/db/queries'
import { withAuth, withClientAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// GitHub issue #47 / Prompt 8.3, GÖREV 1 — "boş durumlarda 'örnek plan
// oluştur' butonu". İki ayrı giriş noktası VAR çünkü iki farklı boş durum
// var: klinikte hiç danışan yokken (bkz. danisanlar/page.tsx) hem danışan
// hem plan gerekiyor; bir danışanın "Planlar" sekmesi boşken (bkz.
// [id]/planlar/planlar-tab.tsx) sadece plan gerekiyor.

const createSampleClientAndPlanForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'client',
      entityId: (_args: [], result: SampleClientAndPlan | undefined) => result?.clientId ?? null,
    },
    async (ctx) =>
      createSampleClientAndPlan(
        db,
        ctx.scope.clinicId,
        ctx.user.id,
        ctx.role === 'dietitian' ? ctx.user.id : null,
      ),
  ),
)

export async function createSampleClientAndPlanAction(): Promise<
  { success: true; clientId: string; planId: string } | { success: false; error: string }
> {
  try {
    const result = await createSampleClientAndPlanForClinic()
    revalidatePath('/danisanlar')
    return { success: true, clientId: result.clientId, planId: result.planId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Örnek plan oluşturulamadı.' }
  }
}

type SamplePlan = Awaited<ReturnType<typeof createSamplePlanForClient>>

const createSamplePlanForClientInClinic = withClientAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan',
      entityId: (_args: [string], result: SamplePlan | undefined) => result?.id ?? null,
    },
    async (ctx, clientId: string) => createSamplePlanForClient(db, ctx.scope.clinicId, ctx.user.id, clientId),
  ),
)

export async function createSamplePlanForClientAction(
  clientId: string,
): Promise<{ success: true; planId: string } | { success: false; error: string }> {
  try {
    const plan = await createSamplePlanForClientInClinic(clientId)
    revalidatePath(`/danisanlar/${clientId}`)
    return { success: true, planId: plan.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Örnek plan oluşturulamadı.' }
  }
}
