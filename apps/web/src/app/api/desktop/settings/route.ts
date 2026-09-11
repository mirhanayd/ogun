import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireClinic, UnauthenticatedError } from '@/lib/authz'
import { inviteDietitianAction, revokeClinicInvitationAction, promoteClinicMemberAction, removeClinicMemberAction } from '@/app/(app)/ayarlar/ekip/actions'
import { updateSmsTemplateAction, runSmsReminderSweepAction } from '@/app/(app)/ayarlar/abonelik/actions'
import { updateWhatsappTemplateAction } from '@/app/(app)/ayarlar/paylasim/actions'
import { updateDataRetentionAction } from '@/app/(app)/ayarlar/veri-guvenligi/actions'
import { smsTemplateSettingSchema } from '@/lib/validation/subscription-schemas'
import { whatsappTemplateSettingSchema } from '@/lib/validation/share-schemas'
import { dataRetentionSettingSchema } from '@/lib/validation/compliance-schemas'
import { rejectUntrustedMutationOrigin } from '@/lib/request-origin'

const requestSchema = z.object({
  userId: z.string().min(1), clinicId: z.string().min(1),
  operation: z.enum(['invite', 'revoke', 'promote', 'remove', 'sms', 'sharing', 'retention', 'sweep']),
  values: z.unknown(),
})

export async function POST(request: Request) {
  const originRejection = rejectUntrustedMutationOrigin(request)
  if (originRejection) return originRejection
  try {
    const ctx = await requireClinic()
    if (ctx.role !== 'owner') return NextResponse.json({ success: false, error: 'Bu işlem için yönetici yetkisi gerekir.' }, { status: 403 })
    const input = requestSchema.parse(await request.json())
    if (input.userId !== ctx.user.id || input.clinicId !== ctx.scope.clinicId) return NextResponse.json({ success: false, error: 'Oturum açık klinik ile eşleşmiyor.' }, { status: 403 })
    let result
    switch (input.operation) {
      case 'invite': result = await inviteDietitianAction(z.object({ name: z.string(), email: z.string().email() }).parse(input.values)); break
      case 'revoke': result = await revokeClinicInvitationAction(z.string().min(1).parse(input.values)); break
      case 'promote': result = await promoteClinicMemberAction(z.string().min(1).parse(input.values)); break
      case 'remove': result = await removeClinicMemberAction(z.string().min(1).parse(input.values)); break
      case 'sms': result = await updateSmsTemplateAction(smsTemplateSettingSchema.parse(input.values)); break
      case 'sharing': result = await updateWhatsappTemplateAction(whatsappTemplateSettingSchema.parse(input.values)); break
      case 'retention': result = await updateDataRetentionAction(dataRetentionSettingSchema.parse(input.values)); break
      case 'sweep': result = await runSmsReminderSweepAction(); break
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof UnauthenticatedError) return NextResponse.json({ success: false, error: 'Oturum yenilenmeli.' }, { status: 401 })
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'Ayar verisi geçersiz.' }, { status: 400 })
    return NextResponse.json({ success: false, error: 'Ayar işlemi tamamlanamadı. Lütfen yeniden deneyin.' }, { status: 500 })
  }
}
