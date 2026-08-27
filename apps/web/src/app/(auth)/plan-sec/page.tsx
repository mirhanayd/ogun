import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getSubscriptionSelectionForUser, listClinicMembershipsForUser } from '@ogun/db/queries'
import { AuthCard } from '../_components/auth-card'
import { requireAuth, UnauthenticatedError } from '@/lib/authz'
import { PlanSelectionForm } from './plan-selection-form'

export default async function PlanSecPage() {
  let authContext: Awaited<ReturnType<typeof requireAuth>>
  try {
    authContext = await requireAuth()
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/giris')
    throw error
  }

  const [memberships, selection] = await Promise.all([
    listClinicMembershipsForUser(db, authContext.user.id),
    getSubscriptionSelectionForUser(db, authContext.user.id),
  ])
  if (memberships.length > 0) redirect('/panel')

  return (
    <AuthCard
      eyebrow="Zorunlu plan seçimi"
      title="Kliniğiniz için çalışma modelini seçin."
      description="Hesabınız oluşturuldu. Devam etmek için aylık veya yıllık ödeme döneminden birini ve kullanacağınız paketi seçmelisiniz."
    >
      <PlanSelectionForm
        initialPlan={selection?.planCode === 'klinik' ? 'klinik' : selection ? 'başlangıç' : undefined}
        initialCycle={selection?.billingCycle}
      />
    </AuthCard>
  )
}
