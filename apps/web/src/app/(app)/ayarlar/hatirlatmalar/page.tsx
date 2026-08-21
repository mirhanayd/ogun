import { redirect } from 'next/navigation'
import { CalendarClock, MessageSquareText } from 'lucide-react'
import { db } from '@ogun/db'
import { getClinicById } from '@ogun/db/queries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireClinic } from '@/lib/authz'
import { DEFAULT_SMS_REMINDER_TEMPLATE } from '@/lib/sms/reminder-template'
import { RunSmsSweepButton } from '../abonelik/subscription-controls'
import { SmsTemplateForm } from '../abonelik/sms-template-form'

export default async function ReminderSettingsPage() {
  const { scope, role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')

  const clinic = await getClinicById(db, scope.clinicId)
  if (!clinic) redirect('/ayarlar')

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="border-b border-border/70 pb-6">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          <MessageSquareText className="size-3.5" />
          Klinik iletişimi
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Randevu hatırlatmaları
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Randevudan önce gönderilen SMS metnini yönetin. Mesajlar yalnızca iletişim izni bulunan
          danışanlara gider.
        </p>
      </header>

      <Card className="max-w-3xl border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
        <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
          <CardTitle className="flex items-center gap-2 tracking-tight">
            <MessageSquareText className="size-4 text-primary" />
            SMS metni
          </CardTitle>
          <CardDescription>
            Danışana, kliniğe ve randevu saatine ait değişkenleri kullanarak mesajı kişiselleştirin.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <SmsTemplateForm
            defaultValues={{
              smsReminderTemplate: clinic.smsReminderTemplate ?? DEFAULT_SMS_REMINDER_TEMPLATE,
            }}
          />
        </CardContent>
      </Card>

      <Card className="max-w-3xl border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 tracking-tight">
            <CalendarClock className="size-4 text-primary" />
            Manuel gönderim kontrolü
          </CardTitle>
          <CardDescription>
            Yaklaşan randevuları şimdi tarayın. Üretimde bu kontrol zamanlanmış görev tarafından
            otomatik yapılır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RunSmsSweepButton />
        </CardContent>
      </Card>
    </div>
  )
}
