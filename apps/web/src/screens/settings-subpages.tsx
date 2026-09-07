'use client'

import { CalendarClock, MessageSquareText, UsersRound } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { NavigationLink } from '@/components/navigation-link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { TeamManager } from '@/app/(app)/ayarlar/ekip/team-manager'
import { SmsTemplateForm } from '@/app/(app)/ayarlar/abonelik/sms-template-form'
import { WhatsappTemplateForm } from '@/app/(app)/ayarlar/paylasim/whatsapp-template-form'
import { DataRetentionForm } from '@/app/(app)/ayarlar/veri-guvenligi/data-retention-form'
import { DEFAULT_SMS_REMINDER_TEMPLATE } from '@/lib/sms/reminder-template'
import { DEFAULT_WHATSAPP_TEMPLATE } from '@/lib/share/message-template'
import type { AuditAction } from '@ogun/db/schema'

export function SettingsSubpage({
  title,
  children,
  notice,
  showTitle = true,
}: {
  title: string
  children: ReactNode
  notice?: string | null
  showTitle?: boolean
}) {
  return (
    <div className="flex flex-col gap-4 pb-8" data-settings-subpage={title}>
      <NavigationLink href="/ayarlar" className="w-fit text-sm text-primary hover:underline">
        ← Ayarlara dön
      </NavigationLink>
      {showTitle ? <h1 className="text-2xl font-semibold">{title}</h1> : null}
      {notice ? (
        <p role="status" className="rounded-lg border bg-muted/40 p-3 text-sm">
          {notice}
        </p>
      ) : null}
      {children}
    </div>
  )
}

export function TeamSettingsView({
  clinicName,
  ...manager
}: ComponentProps<typeof TeamManager> & { clinicName: string }) {
  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="border-b border-border/70 pb-6">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          <UsersRound className="size-3.5" />
          {clinicName}
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Ekip ve yetkiler
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Diyetisyenleri kliniğinize davet edin ve danışan görünürlüğünü rol bazında güvenle
          yönetin.
        </p>
      </header>
      <TeamManager {...manager} />
    </div>
  )
}

export function ReminderSettingsView({
  template,
  onSave,
  disabled,
  sweepControl,
}: {
  template?: string | null
  onSave: ComponentProps<typeof SmsTemplateForm>['onSave']
  disabled?: boolean
  sweepControl: ReactNode
}) {
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
            onSave={onSave}
            disabled={disabled}
            defaultValues={{
              smsReminderTemplate: template ?? DEFAULT_SMS_REMINDER_TEMPLATE,
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
        <CardContent>{sweepControl}</CardContent>
      </Card>
    </div>
  )
}

export function ReminderSweepControl({
  disabled,
  message,
  onRun,
}: {
  disabled?: boolean
  message?: string | null
  onRun: () => void | Promise<void>
}) {
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => void onRun()}>
        SMS hatırlatmalarını şimdi gönder
      </Button>
      {message ? <p role="status">{message}</p> : null}
    </>
  )
}

export function SharingSettingsView({
  template,
  onSave,
  disabled,
}: {
  template?: string | null
  onSave: ComponentProps<typeof WhatsappTemplateForm>['onSave']
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp mesaj şablonu</CardTitle>
          <CardDescription>
            Danışana plan paylaşım linkini WhatsApp üzerinden gönderirken kullanılacak hazır mesaj
            metni (bkz. danışan planları — &ldquo;Paylaş&rdquo; diyaloğu). Değişiklik sadece bundan
            sonraki gönderimleri etkiler.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsappTemplateForm
            onSave={onSave}
            disabled={disabled}
            defaultValues={{ whatsappMessageTemplate: template ?? DEFAULT_WHATSAPP_TEMPLATE }}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export interface SettingsAuditLog {
  id: string
  createdAt: string | Date
  action: AuditAction
  entityType: string
  entityId: string | null
  ipAddress: string | null
}
const ACTION_LABELS_TR: Record<AuditAction, string> = {
  create: 'Oluşturma',
  read: 'Görüntüleme',
  update: 'Güncelleme',
  delete: 'Silme',
  export: 'Dışa aktarma',
}
export function SecuritySettingsView({
  retentionDays,
  recentLogs,
  onSave,
  disabled,
}: {
  retentionDays?: number | null
  recentLogs: SettingsAuditLog[]
  onSave: ComponentProps<typeof DataRetentionForm>['onSave']
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Veri saklama süresi</CardTitle>
          <CardDescription>
            Danışan verisinin klinikte varsayılan olarak saklanacağı süre. Kesin süre, KVKK uyum
            sürecinde ürün sahibi/hukuk ekibi tarafından ayrıca belirlenecektir — bu sadece teknik
            bir varsayılan ayardır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataRetentionForm
            defaultValues={{ dataRetentionDays: retentionDays ?? 3650 }}
            onSave={onSave}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Son erişim kayıtları</CardTitle>
          <CardDescription>
            Bu klinikteki danışan verisine yapılan son işlemler (görüntüleme dahil) — sağlık verisi
            özel nitelikli kişisel veri sayıldığı için erişim de kayıt altına alınır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz bir denetim kaydı yok.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>İşlem</TableHead>
                  <TableHead>Varlık</TableHead>
                  <TableHead>IP adresi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ACTION_LABELS_TR[log.action]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.entityType}
                      {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.ipAddress ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function SubscriptionSettingsView() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Abonelik</CardTitle>
        <CardDescription>Abonelik yönetimi şu anda kullanıma açık değil.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <NavigationLink href="/ayarlar">Klinik ayarlarına dön</NavigationLink>
        </Button>
      </CardContent>
    </Card>
  )
}
