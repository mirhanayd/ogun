import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getDraftClinicForUser, getWorkingHoursForClinic } from '@ogun/db/queries'
import { NoActiveClinicError, UnauthenticatedError, requireAuth, requireClinic } from '@/lib/authz'
import { DEFAULT_PRIMARY_COLOR, buildDefaultWorkingHours, mergeWorkingHours } from '@/lib/onboarding'
import { OnboardingWizard } from './onboarding-wizard'

// Klinik onboarding akışı (Prompt 3.2, GitHub issue #11): klinik adı/telefon/
// adres, logo + marka rengi, çalışma saatleri adımlarını burada kuruyoruz.
// Adımlar arası ilerleme, ayrı bir "wizard state" tablosu yerine clinics
// satırının kendisinde tutulur — bkz. packages/db/src/schema/tenancy.ts
// clinics tablosunun üstündeki tasarım notu.
async function getSetupContext() {
  let authCtx: Awaited<ReturnType<typeof requireAuth>>
  try {
    authCtx = await requireAuth()
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/giris')
    throw error
  }

  // Kullanıcının zaten aktif bir kliniği varsa (onboarding daha önce
  // tamamlanmış) burada tekrar sihirbaz göstermeye gerek yok.
  let alreadyOnboarded = false
  try {
    await requireClinic()
    alreadyOnboarded = true
  } catch (error) {
    if (!(error instanceof NoActiveClinicError)) throw error
  }
  if (alreadyOnboarded) redirect('/panel')

  return authCtx
}

export default async function KurulumPage() {
  const { user } = await getSetupContext()
  const draft = await getDraftClinicForUser(db, user.id)
  const workingHours = draft ? await getWorkingHoursForClinic(db, draft.id) : []

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <OnboardingWizard
        userName={user.name}
        initialStep={Math.min(draft?.onboardingStep ?? 1, 3)}
        initialClinicInfo={{
          name: draft?.name ?? '',
          phone: draft?.phone ?? '',
          address: draft?.address ?? '',
        }}
        initialBranding={{
          logoDataUrl: draft?.logoUrl ?? '',
          primaryColor: draft?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
        }}
        initialWorkingHours={workingHours.length > 0 ? mergeWorkingHours(workingHours) : buildDefaultWorkingHours()}
      />
    </div>
  )
}
