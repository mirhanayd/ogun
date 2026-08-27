import { redirect } from 'next/navigation'
import { CreditCard, LockKeyhole } from 'lucide-react'
import { db } from '@ogun/db'
import { getClinicById, getSubscriptionSelectionForUser } from '@ogun/db/queries'
import { AuthCard } from '../_components/auth-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { requireRole, UnauthenticatedError } from '@/lib/authz'
import { PLAN_DEFINITIONS } from '@/lib/subscription/plans'

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return { name: parts[0] ?? '', surname: parts.slice(1).join(' ') }
}

export default async function OdemePage({ searchParams }: { searchParams: Promise<{ durum?: string }> }) {
  let context: Awaited<ReturnType<typeof requireRole>>
  try {
    context = await requireRole('owner')
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/giris')
    throw error
  }

  const [clinic, selection, params] = await Promise.all([
    getClinicById(db, context.scope.clinicId),
    getSubscriptionSelectionForUser(db, context.user.id),
    searchParams,
  ])
  if (!clinic) redirect('/kurulum')
  if (!selection) redirect('/plan-sec')
  if (clinic.subscriptionStatus === 'active') redirect('/panel')

  const plan = PLAN_DEFINITIONS[selection.planCode]
  const amount = plan.prices[selection.billingCycle]
  const names = splitName(context.user.name)

  return (
    <AuthCard
      eyebrow="Güvenli ödeme"
      title="Aboneliğinizi iyzico ile başlatın."
      description={`${plan.label} · ${amount.toLocaleString('tr-TR')} TL ${selection.billingCycle === 'monthly' ? '/ ay' : '/ yıl, peşin'}`}
    >
      {params.durum === 'basarisiz' && (
        <p role="alert" className="mb-5 rounded-xl border border-destructive/20 bg-destructive/[0.06] p-3 text-sm text-destructive">
          Ödeme doğrulanamadı. Kartınızdan tahsilat yapıldıysa lütfen destek ekibiyle iletişime geçin.
        </p>
      )}
      <form action="/api/iyzico/checkout/start" method="post" className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">Ad</Label>
          <Input id="name" name="name" defaultValue={names.name} required maxLength={60} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="surname">Soyad</Label>
          <Input id="surname" name="surname" defaultValue={names.surname} required maxLength={60} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gsmNumber">Cep telefonu</Label>
          <Input id="gsmNumber" name="gsmNumber" type="tel" placeholder="+905xxxxxxxxx" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="identityNumber">T.C. kimlik numarası</Label>
          <Input id="identityNumber" name="identityNumber" inputMode="numeric" maxLength={11} required />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="address">Fatura adresi</Label>
          <Input id="address" name="address" defaultValue={clinic.address ?? ''} required maxLength={300} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="city">Şehir</Label>
          <Input id="city" name="city" required maxLength={60} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="zipCode">Posta kodu</Label>
          <Input id="zipCode" name="zipCode" inputMode="numeric" maxLength={5} required />
        </div>
        <Button type="submit" className="mt-2 h-12 rounded-xl sm:col-span-2">
          <CreditCard aria-hidden="true" /> iyzico ödeme ekranına geç
        </Button>
      </form>
      <div className="mt-5 flex gap-2 text-xs leading-5 text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Kart bilgileriniz Öğün sunucularına gelmez; iyzico’nun güvenli ödeme formunda işlenir.
      </div>
    </AuthCard>
  )
}
