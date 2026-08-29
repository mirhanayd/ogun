'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import { updateClinicIdentity } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import {
  clinicIdentitySchema,
  normalizeClinicIdentity,
  type ClinicIdentityFormValues,
} from '@/lib/validation/clinic-identity-schemas'

export interface ClinicIdentityActionResult {
  success: boolean
  error?: string
  identity?: Awaited<ReturnType<typeof updateClinicIdentity>>
}

const updateActiveClinicIdentity = withAuth(
  withAudit(
    {
      action: 'update',
      entityType: 'clinic_identity',
      metadata: () => ({
        fields: ['name', 'logoUrl', 'primaryColor', 'phone', 'address', 'taxId'],
      }),
    },
    async (ctx, input: ClinicIdentityFormValues) =>
      updateClinicIdentity(db, ctx.scope.clinicId, normalizeClinicIdentity(input)),
  ),
  ['owner'],
)

export async function updateClinicIdentityAction(
  input: ClinicIdentityFormValues,
): Promise<ClinicIdentityActionResult> {
  const parsed = clinicIdentitySchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Geçersiz veri gönderildi.' }
  }

  try {
    const identity = await updateActiveClinicIdentity(parsed.data)
    // App layout klinik adı/logo/rengi için canonical okuyucudur. Tek bir
    // layout invalidation hem ayarlar sayfasını hem web/desktop chrome'u yeniler.
    revalidatePath('/', 'layout')
    return { success: true, identity }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Klinik kimliği güncellenemedi.',
    }
  }
}
