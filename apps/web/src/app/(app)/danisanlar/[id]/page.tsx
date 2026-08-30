import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { listClinicDietitians } from '@ogun/db/queries'
import { calculateBmi } from '@ogun/nutrition-core'
import { ClientDetailView } from '@/screens/client-detail-view'
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
    <ClientDetailView
      name={`${client.firstName} ${client.lastName}`}
      ageLabel={age !== null ? `${age} yaş` : 'Yaş —'}
      sexLabel={client.sex ? SEX_LABELS_TR[client.sex] : null}
      phone={client.phone}
      email={client.email}
      alerts={[
        ...(abnormalLabResults.length > 0 ? [`${abnormalLabResults.length} anormal tahlil değeri`] : []),
        ...(consentPending ? ['Rıza bekliyor'] : []),
      ]}
      notice={consentPending ? <div className="flex items-center gap-2 pt-1"><p className="text-xs text-muted-foreground">Bu danışan CSV içe aktarma ile eklendi, KVKK/açık rıza henüz onaylanmadı.</p><ConfirmConsentButton clientId={client.id} /></div> : null}
      summary={[
        { label: 'Güncel kilo', value: currentWeightKg !== null ? `${currentWeightKg} kg` : '—' },
        { label: 'BKİ', value: currentBmi !== null ? currentBmi.toFixed(1) : '—' },
        { label: 'Hedef', value: weightGoal ? `${Number(weightGoal.targetValue)} kg` : '—' },
        { label: 'Sonraki randevu', value: nextAppointment ? nextAppointment.startsAt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—' },
      ]}
      tabs={[
        { value: 'genel', label: 'Genel', content: <GeneralTabForm client={client} dietitians={dietitians} /> },
        { value: 'olcumler', label: 'Ölçümler', content: <MeasurementsTab clientId={client.id} /> },
        { value: 'planlar', label: 'Planlar', content: <PlanlarTab clientId={client.id} /> },
        { value: 'anamnez', label: 'Anamnez', content: <AnamnesisForm clientId={client.id} healthRecord={healthRecord} /> },
        { value: 'laboratuvar', label: 'Laboratuvar', content: <LabResultsTab clientId={client.id} /> },
        { value: 'dosyalar', label: 'Dosyalar', content: <DocumentsTab clientId={client.id} /> },
        { value: 'randevular', label: 'Randevular', content: <AppointmentsTab clientId={client.id} /> },
        { value: 'odemeler', label: 'Ödemeler', content: <OdemelerTab clientId={client.id} /> },
      ]}
      quickActions={<><NewPlanButton clientId={client.id} className="w-full justify-start gap-1.5" /><NewAppointmentButton clientId={client.id} clientName={`${client.firstName} ${client.lastName}`} dietitians={dietitians} className="w-full justify-start gap-1.5" /></>}
    />
  )
}
