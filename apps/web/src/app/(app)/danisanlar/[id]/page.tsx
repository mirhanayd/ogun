import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { listClinicDietitians } from '@ogun/db/queries'
import { calculateBmi } from '@ogun/nutrition-core'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { requireClinic } from '@/lib/authz'
import { viewClientRecord } from '@/lib/data-subject-rights'
import { calculateAge } from '@/lib/client-age'
import { SEX_LABELS_TR } from '@/lib/validation/client-schemas'
import { ConfirmConsentButton } from './confirm-consent-button'
import { GeneralTabForm } from './general-tab-form'
import { getClientActiveGoal, getClientLatestMeasurement } from './measurements/queries'
import { MeasurementsTab } from './measurements/measurements-tab'
import { getClientHealthRecord } from './anamnez/queries'
import { AnamnesisForm } from './anamnez/anamnesis-form'
import { listClientAbnormalLabResults } from './laboratuvar/queries'
import { LabResultsTab } from './laboratuvar/lab-results-tab'
import { DocumentsTab } from './dosyalar/documents-tab'
import { NewPlanButton } from './planlar/new-plan-button'
import { PlanlarTab } from './planlar/planlar-tab'
import { AppointmentsTab } from './randevular/appointments-tab'
import { NewAppointmentButton } from './randevular/new-appointment-button'
import { OdemelerTab } from './odemeler/odemeler-tab'
import { getClientNextAppointment } from '../../randevular/queries'

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

// /danisanlar/[id] — GitHub issue #17 / Prompt 4.1, GÖREV 4: danışan detay
// sayfası KABUĞU. Sadece "Genel" sekmesi gerçek içerik taşır (bu issue'nun
// kapsamındaki alanlar); diğer sekmeler EmptyState stub — hangi gelecek
// issue'nun onları dolduracağı her birinde ayrıca not edildi.
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { scope, role, user } = await requireClinic()

  // Atama kapsamını diğer sağlık verisi sorgularından önce doğrula. Böylece
  // başka bir danışanın URL'si, paralel alt sorguların hata üretmesine veya
  // gereksiz veri okumasına yol açmadan 404 ile kapanır.
  const client = await viewClientRecord(id)
  if (!client || client.deletedAt) {
    notFound()
  }

  const [
    allDietitians,
    latestMeasurement,
    weightGoal,
    healthRecord,
    abnormalLabResults,
    nextAppointment,
  ] = await Promise.all([
    listClinicDietitians(db, scope.clinicId),
    getClientLatestMeasurement(id),
    getClientActiveGoal(id, 'kilo'),
    getClientHealthRecord(id),
    listClientAbnormalLabResults(id),
    getClientNextAppointment(id),
  ])
  const dietitians = role === 'dietitian'
    ? allDietitians.filter((dietitian) => dietitian.id === user.id)
    : allDietitians

  const age = calculateAge(client.birthDate)

  // Güncel kilo / BKİ / hedef (GitHub issue #18 / Prompt 4.2 tabloları artık
  // var) — "Son görüşme" hâlâ "—": randevu modülü henüz açılmamış bir issue.
  const currentWeightKg =
    latestMeasurement?.weightKg !== null && latestMeasurement?.weightKg !== undefined
      ? Number(latestMeasurement.weightKg)
      : null
  const currentHeightCm =
    latestMeasurement?.heightCm !== null && latestMeasurement?.heightCm !== undefined
      ? Number(latestMeasurement.heightCm)
      : null
  const currentBmi =
    currentWeightKg !== null && currentHeightCm !== null
      ? calculateBmi(currentWeightKg, currentHeightCm)
      : null

  // GitHub issue #47 / Prompt 8.3, GÖREV 3 — CSV içe aktarmayla oluşan
  // "rıza bekliyor" durumu (bkz. packages/db/src/queries/clients.ts
  // bulkImportClients dosya başı notu). Normal (tekil) danışan oluşturma
  // akışında bu durum HİÇ oluşmaz (createClientAction her zaman rızayı
  // zorunlu kılar) — bu yüzden bu rozet SADECE toplu içe aktarımdan gelen
  // kayıtlarda görünür.
  const consentPending = client.kvkkConsentAt === null || client.explicitConsentAt === null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar size="lg">
            <AvatarFallback>{initials(client.firstName, client.lastName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 sm:flex-none">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">
                {client.firstName} {client.lastName}
              </h1>
              <Badge variant="secondary">{age !== null ? `${age} yaş` : 'Yaş —'}</Badge>
              {client.sex && <Badge variant="outline">{SEX_LABELS_TR[client.sex]}</Badge>}
              {abnormalLabResults.length > 0 && (
                <Badge variant="destructive">
                  {abnormalLabResults.length} anormal tahlil değeri
                </Badge>
              )}
              {consentPending && <Badge variant="destructive">Rıza bekliyor</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {client.phone || 'Telefon —'} {client.email ? `· ${client.email}` : ''}
            </p>
            {consentPending && (
              <div className="flex items-center gap-2 pt-1">
                <p className="text-xs text-muted-foreground">
                  Bu danışan CSV içe aktarma ile eklendi, KVKK/açık rıza henüz onaylanmadı.
                </p>
                <ConfirmConsentButton clientId={client.id} />
              </div>
            )}
          </div>
          {/* Son görüşme artık GERÇEK veri — GitHub issue #39 / Prompt 7.1
              randevu modülünün getClientNextAppointment sorgusundan. */}
          <div className="grid w-full grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 pt-4 text-sm sm:ml-auto sm:w-auto sm:grid-cols-4 sm:border-0 sm:pt-0">
            <SummaryStat
              label="Güncel kilo"
              value={currentWeightKg !== null ? `${currentWeightKg} kg` : '—'}
            />
            <SummaryStat label="BKİ" value={currentBmi !== null ? currentBmi.toFixed(1) : '—'} />
            <SummaryStat
              label="Hedef"
              value={weightGoal ? `${Number(weightGoal.targetValue)} kg` : '—'}
            />
            <SummaryStat
              label="Sonraki randevu"
              value={
                nextAppointment
                  ? nextAppointment.startsAt.toLocaleDateString('tr-TR', {
                      day: '2-digit',
                      month: 'short',
                    })
                  : '—'
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        <Tabs defaultValue="genel" className="min-w-0">
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <TabsList className="min-w-max justify-start">
              <TabsTrigger value="genel" className="flex-none">
                Genel
              </TabsTrigger>
              <TabsTrigger value="olcumler" className="flex-none">
                Ölçümler
              </TabsTrigger>
              <TabsTrigger value="planlar" className="flex-none">
                Planlar
              </TabsTrigger>
              <TabsTrigger value="anamnez" className="flex-none">
                Anamnez
              </TabsTrigger>
              <TabsTrigger value="laboratuvar" className="flex-none">
                Laboratuvar
              </TabsTrigger>
              <TabsTrigger value="dosyalar" className="flex-none">
                Dosyalar
              </TabsTrigger>
              <TabsTrigger value="randevular" className="flex-none">
                Randevular
              </TabsTrigger>
              <TabsTrigger value="odemeler" className="flex-none">
                Ödemeler
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="genel" className="mt-4">
            <GeneralTabForm client={client} dietitians={dietitians} />
          </TabsContent>

          <TabsContent value="olcumler" className="mt-4">
            <MeasurementsTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="planlar" className="mt-4">
            <PlanlarTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="anamnez" className="mt-4">
            <AnamnesisForm clientId={client.id} healthRecord={healthRecord} />
          </TabsContent>

          <TabsContent value="laboratuvar" className="mt-4">
            <LabResultsTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="dosyalar" className="mt-4">
            <DocumentsTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="randevular" className="mt-4">
            <AppointmentsTab clientId={client.id} />
          </TabsContent>

          <TabsContent value="odemeler" className="mt-4">
            <OdemelerTab clientId={client.id} />
          </TabsContent>
        </Tabs>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">Hızlı eylemler</p>
            {/* "Yeni ölçüm" KALDIRILDI — GitHub issue #18 ile artık gerçek bir
                giriş noktası VAR (Ölçümler sekmesindeki form), bu yüzden
                "Yakında" rozetli devre dışı bir düğme burada YANLIŞ olurdu.
                GitHub issue #25 ile "Yeni plan" AYNI şekilde gerçek bir giriş
                noktasına kavuştu (bkz. planlar/new-plan-button.tsx). GitHub
                issue #39 ile "Randevu ver" de ARTIK gerçek — randevu
                modülünün AppointmentDialog'unu açar (bkz.
                randevular/new-appointment-button.tsx). */}
            <NewPlanButton clientId={client.id} className="w-full justify-start gap-1.5" />
            <NewAppointmentButton
              clientId={client.id}
              clientName={`${client.firstName} ${client.lastName}`}
              dietitians={dietitians}
              className="w-full justify-start gap-1.5"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
