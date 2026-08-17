import { CalendarClock, MessageSquareText, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_SMS_REMINDER_TEMPLATE } from '@/lib/sms/reminder-template'
import { getSubscriptionOverview } from './queries'
import { PlanSelector } from './plan-selector'
import { SmsTemplateForm } from './sms-template-form'
import { CancelSubscriptionButton, RunSmsSweepButton } from './subscription-controls'

function formatDateTr(value: Date | null): string {
  return value ? value.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'
}

// /ayarlar/abonelik — GitHub issue #41 / Prompt 7.3, GÖREV 1 + GÖREV 2 +
// GÖREV 3. /ayarlar/paylasim ve /ayarlar/veri-guvenligi (GitHub #36, #12) ile
// AYNI alt-sayfa deseni: /ayarlar ana sayfasından bağlanan, rol kısıtını
// sunucu tarafında AYRICA uygulayan (bkz. queries.ts/actions.ts requireRole)
// bir nested route.
export default async function AbonelikAyarlariPage() {
  const { clinic, subscription, warnings, usage, limits } = await getSubscriptionOverview()

  const isTrialing = clinic.subscriptionStatus === 'trialing'
  const trialDaysLeft = clinic.trialEndsAt
    ? Math.max(0, Math.ceil((clinic.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-primary" />
            Abonelik durumu
          </CardTitle>
          <CardDescription>
            {isTrialing
              ? `Ücretsiz deneme sürümündesiniz — kart bilgisi istenmeden 14 gün (bkz. GitHub issue #41).`
              : 'Aktif abonelik.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Badge variant={isTrialing ? 'secondary' : 'default'} className="capitalize">
            {clinic.subscriptionStatus}
          </Badge>
          {isTrialing && clinic.trialEndsAt && (
            <span className="text-sm text-muted-foreground">
              Deneme süresi {formatDateTr(clinic.trialEndsAt)} tarihinde bitiyor ({trialDaysLeft} gün kaldı).
            </span>
          )}
          {subscription && (
            <span className="text-sm text-muted-foreground">
              Plan: <span className="font-medium capitalize">{subscription.planCode}</span>
              {subscription.cancelAtPeriodEnd && ' — dönem sonunda iptal edilecek'}
            </span>
          )}
        </CardContent>
      </Card>

      {warnings.some((w) => w.level !== 'normal') && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <TriangleAlert className="size-4" />
              Kullanım uyarıları
            </CardTitle>
            <CardDescription>
              Bu uyarılar sadece bilgilendirme amaçlıdır — danışan verilerinize erişiminiz hiçbir şekilde
              kesilmez, sadece planınızı yükseltmenizi öneririz.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {warnings
              .filter((w) => w.level !== 'normal')
              .map((w) => (
                <p key={w.resource} className="text-sm">
                  {w.message}
                </p>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kullanım</CardTitle>
          <CardDescription>Mevcut plan/deneme limitlerine göre kullanımınız.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UsageStat label="Danışan" used={usage.clientCount} limit={limits.maxClients} />
          <UsageStat label="Kullanıcı" used={usage.userCount} limit={limits.maxUsers} />
          <UsageStat label="SMS (bu dönem)" used={usage.smsSentThisPeriod} limit={limits.smsQuotaPerMonth} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planlar</CardTitle>
          <CardDescription>
            Roadmap gereği ödeme sağlayıcı (iyzico) bir arayüz arkasına alındı — bu ortamda gerçek iyzico kimlik
            bilgisi olmadığı için plan seçimi &ldquo;manuel&rdquo; sağlayıcı ile hemen etkinleşir (bkz.
            lib/subscription/payment-provider/).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanSelector currentPlan={subscription?.planCode ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abonelik yönetimi</CardTitle>
        </CardHeader>
        <CardContent>
          <CancelSubscriptionButton hasActiveSubscription={subscription !== null && !subscription.cancelAtPeriodEnd} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-primary" />
            SMS hatırlatma (Netgsm)
          </CardTitle>
          <CardDescription>
            Randevudan 24 saat önce otomatik SMS gönderilir — SADECE danışanın SMS rızası (bkz. danışan &ldquo;Genel&rdquo;
            sekmesi) varsa. Bu ortamda gerçek Netgsm kimlik bilgisi olmadığı için &ldquo;manuel&rdquo; sağlayıcı
            kullanılır (bkz. lib/sms/manual-provider.ts) — mesaj gerçekten SMS olarak GİTMEZ, sunucu loguna yazılır.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SmsTemplateForm
            defaultValues={{ smsReminderTemplate: clinic.smsReminderTemplate ?? DEFAULT_SMS_REMINDER_TEMPLATE }}
          />
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs text-muted-foreground">
              Üretimde bu, 24 saatlik pencereyi periyodik olarak tarayan bir zamanlayıcı (cron/worker) tarafından
              otomatik tetiklenir — bu repoda henüz kurulu değil (bkz. lib/sms/reminder-eligibility.ts). Aşağıdaki
              buton, aynı mantığı manuel olarak (demo/pilot amaçlı) çalıştırır.
            </p>
            <RunSmsSweepButton />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UsageStat({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">
        {used}
        <span className="text-sm font-normal text-muted-foreground"> / {limit ?? 'sınırsız'}</span>
      </p>
    </div>
  )
}
