'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrandingFormValues, ClinicInfoFormValues, WorkingHourFormValue } from '@/lib/validation/onboarding-schemas'
import { ClinicInfoStep } from './steps/clinic-info-step'
import { BrandingStep } from './steps/branding-step'
import { WorkingHoursStep } from './steps/working-hours-step'

const STEPS = [
  { step: 1, label: 'Klinik' },
  { step: 2, label: 'Marka' },
  { step: 3, label: 'Saatler' },
] as const

export interface OnboardingWizardProps {
  userName: string
  initialStep: number
  initialClinicInfo: ClinicInfoFormValues
  initialBranding: BrandingFormValues
  initialWorkingHours: WorkingHourFormValue[]
}

// Onboarding sihirbazı — üç adım, her adım kendi server action'ıyla
// (bkz. ../actions.ts) kaydedilir; bu bileşen sadece hangi adımın
// gösterildiğini tutar (bkz. schema/tenancy.ts clinics.onboardingStep —
// asıl "kaldığı yerden devam" durumu orada, veritabanında tutuluyor; bu
// state sadece o sayfa yüklendikten SONRAKİ istemci taraflı gezinme için).
export function OnboardingWizard({
  userName,
  initialStep,
  initialClinicInfo,
  initialBranding,
  initialWorkingHours,
}: OnboardingWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(() => Math.min(Math.max(initialStep, 1), 3))

  return (
    <div className="w-full max-w-lg">
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">Hoş geldiniz, {userName.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">Kliniğinizi birkaç adımda kuralım.</p>
      </div>
      <StepperHeader current={step} />
      <div className="mt-6">
        {step === 1 && <ClinicInfoStep defaultValues={initialClinicInfo} onSaved={() => setStep(2)} />}
        {step === 2 && (
          <BrandingStep defaultValues={initialBranding} onBack={() => setStep(1)} onSaved={() => setStep(3)} />
        )}
        {step === 3 && (
          <WorkingHoursStep
            defaultValues={initialWorkingHours}
            onBack={() => setStep(2)}
            onCompleted={() => {
              // Onboarding tamamlandı: server action zaten setActiveClinic()
              // çağırdı (session.activeClinicId güncellendi). Uygulama
              // kabuğunun (app)/layout.tsx bunu görmesi için tam bir
              // navigasyon + refresh gerekiyor — bkz. giris/kayit
              // sayfalarındaki aynı örüntü.
              router.push('/odeme')
              router.refresh()
            }}
          />
        )}
      </div>
    </div>
  )
}

function StepperHeader({ current }: { current: number }) {
  return (
    <ol className="flex items-center">
      {STEPS.map(({ step, label }, index) => (
        <li key={step} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                step < current && 'bg-primary text-primary-foreground',
                step === current && 'bg-primary/15 text-primary ring-2 ring-primary',
                step > current && 'bg-muted text-muted-foreground',
              )}
              aria-current={step === current ? 'step' : undefined}
            >
              {step < current ? <CheckIcon className="size-3.5" /> : step}
            </span>
            <span className={cn('text-xs font-medium', step === current ? 'text-foreground' : 'text-muted-foreground')}>
              {label}
            </span>
          </div>
          {index < STEPS.length - 1 && <span className="mx-2 h-px flex-1 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}
