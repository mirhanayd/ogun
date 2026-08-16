import { Share2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { db } from '@ogun/db'
import { getClinicById, getWorkingHoursForClinic } from '@ogun/db/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { requireClinic } from '@/lib/authz'
import { WEEKDAYS_TR } from '@/lib/onboarding'

// Ayarlar sayfası — Prompt 3.2 kapsamında sadece bir yer tutucu istenmişti,
// ama onboarding'de toplanan veriyi (klinik bilgileri, marka, çalışma
// saatleri) OKUNUR bir özet olarak göstermek neredeyse bedavaydı (sorgular
// zaten packages/db/src/queries/clinics.ts ve working-hours.ts'de var) —
// bu yüzden salt bir "yakında" kartından daha faydalı bir sürüm eklendi.
// Düzenleme (mutasyon) formu bu issue'nun kapsamı DIŞINDA bırakıldı.
export default async function AyarlarPage() {
  const { scope } = await requireClinic()
  const [clinic, workingHours] = await Promise.all([
    getClinicById(db, scope.clinicId),
    getWorkingHoursForClinic(db, scope.clinicId),
  ])

  if (!clinic) {
    return <p className="text-sm text-muted-foreground">Klinik bulunamadı.</p>
  }

  const hoursByDay = new Map(workingHours.map((row) => [row.dayOfWeek, row]))

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Klinik bilgileri</CardTitle>
          <CardDescription>Onboarding sırasında girilen bilgiler. Düzenleme yakında eklenecek.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <SettingsField label="Klinik adı" value={clinic.name} />
          <SettingsField label="Telefon" value={clinic.phone} />
          <SettingsField label="Adres" value={clinic.address} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marka</CardTitle>
          <CardDescription>Diyet listesi PDF çıktısında (ileride) kullanılacak.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
            {clinic.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URI, next/image optimize edemez
              <img src={clinic.logoUrl} alt="Klinik logosu" className="size-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">Logo yok</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className="size-6 rounded-full border border-border"
              style={{ backgroundColor: clinic.primaryColor ?? undefined }}
            />
            <span className="text-sm text-muted-foreground">{clinic.primaryColor ?? 'Belirtilmedi'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Çalışma saatleri</CardTitle>
          <CardDescription>Randevu modülü müsaitlik hesabında bu saatleri kullanacak.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {WEEKDAYS_TR.map((day, index) => {
            const hour = hoursByDay.get(day.value)
            return (
              <div key={day.value}>
                {index > 0 && <Separator className="mb-2" />}
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{day.label}</span>
                  {hour?.isOpen ? (
                    <span className="text-muted-foreground">
                      {hour.startTime.slice(0, 5)} — {hour.endTime.slice(0, 5)}
                    </span>
                  ) : (
                    <Badge variant="secondary">Kapalı</Badge>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="size-4 text-primary" />
            Plan paylaşımı
          </CardTitle>
          <CardDescription>
            Danışanlara plan paylaşım linkini gönderirken kullanılan WhatsApp mesaj şablonu (bkz. GitHub issue
            #36).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/ayarlar/paylasim">Paylaşım ayarlarını aç</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Veri güvenliği ve KVKK
          </CardTitle>
          <CardDescription>
            Erişim kayıtları (denetim izi) ve veri saklama süresi ayarı — sağlık verisi özel nitelikli
            kişisel veri sayıldığı için ayrıca ele alınır (bkz. GitHub issue #12).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link href="/ayarlar/veri-guvenligi">Veri güvenliği ayarlarını aç</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsField({ label, value, className }: { label: string; value: string | null; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  )
}
