import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import type { ClinicRole, DomainEntity, OgunRepositories } from '@/data/repositories'
import { calculateAge } from '@/lib/client-age'
import { listFromText, type AnamnesisFormValues } from '@/lib/validation/anamnesis-schemas'
import type { GoalFormValues, MeasurementFormValues } from '@/lib/validation/measurement-schemas'
import type { LabResultFormValues } from '@/lib/validation/lab-schemas'
import type { NewClientFormValues } from '@/lib/validation/client-schemas'
import { ClientsActionsView, ClientsScreen } from '@/screens/clients-screen'
import { ClientsTableView, type ClientsFilters } from '@/screens/clients-table-view'
import { ClientDetailLoadingView, ClientDetailView } from '@/screens/client-detail-view'
import { ClientPlansView } from '@/screens/client-plans-view'
import { NewClientForm } from '@/app/(app)/danisanlar/yeni/new-client-form'
import { GeneralTabForm } from '@/app/(app)/danisanlar/[id]/general-tab-form'
import { MeasurementsView } from '@/screens/measurements-view'
import type { ChartMeasurement } from '@/app/(app)/danisanlar/[id]/measurements/progress-charts'
import type { ActiveGoalRow } from '@/app/(app)/danisanlar/[id]/measurements/goal-panel'
import { AnamnesisForm, type ClientHealthRow } from '@/app/(app)/danisanlar/[id]/anamnez/anamnesis-form'
import { LabResultsView, type LabResultChartPoint } from '@/screens/lab-results-view'
import { DocumentsView } from '@/screens/documents-view'
import type { DocumentRow } from '@/app/(app)/danisanlar/[id]/dosyalar/document-list'
import { OdemelerView } from '@/screens/client-payments-view'
import { ClientAppointmentsView } from '@/screens/client-appointments-view'

const text = (entity: DomainEntity, key: string) => typeof entity[key] === 'string' ? String(entity[key]) : ''
const numberOrNull = (value: unknown) => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value)
const date = (value: unknown) => new Date(typeof value === 'string' ? value : new Date().toISOString())

export function LocalNewClientAdapter({ repository, onCreated }: { repository: OgunRepositories['clients']; onCreated: (id: string) => void }) {
  async function save(values: NewClientFormValues) {
    const id = crypto.randomUUID()
    try {
      await repository.create({ id, ...values, sex: values.sex === 'unspecified' ? null : values.sex })
      return { success: true, clientId: id }
    } catch (reason) { return { success: false, error: String(reason) } }
  }
  return <NewClientForm onSave={save} onCreated={onCreated} />
}

export function LocalClientsAdapter({ role, repository }: { role: ClinicRole; repository: OgunRepositories['clients'] }) {
  const [clients, setClients] = useState<DomainEntity[]>([])
  const [filters, setFilters] = useState<ClientsFilters>({ search: '', status: '', assignedDietitianId: '' })
  useEffect(() => {
    const load = () => void repository.list().then(setClients)
    load(); window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [repository])
  const filtered = useMemo(() => clients.filter((client) => {
    const haystack = [client.firstName, client.lastName, client.phone, client.email].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR')
    return (!filters.search || haystack.includes(filters.search.toLocaleLowerCase('tr-TR'))) && (!filters.status || client.status === filters.status)
  }), [clients, filters])
  return <ClientsScreen role={role} actions={role === 'assistant' ? undefined : <ClientsActionsView canImport={false} />}>
    <ClientsTableView result={{ rows: filtered.map((client) => ({ id: client.id, firstName: text(client, 'firstName'), lastName: text(client, 'lastName'), birthDate: text(client, 'birthDate') || null, status: client.status === 'pasif' || client.status === 'arşiv' ? client.status : 'aktif', assignedDietitianId: text(client, 'assignedDietitianId') || null, assignedDietitianName: text(client, 'assignedDietitianName') || null, createdAt: date(client.createdAt) })), total: filtered.length, page: 1, pageSize: Math.max(filtered.length, 1) }} dietitians={[]} role={role} filters={filters} onNavigate={setFilters} onArchive={async (ids) => { try { await Promise.all(ids.map((id) => repository.archive(id))); return { success: true } } catch (reason) { return { success: false, error: String(reason) } } }} onAssign={async () => ({ success: false, error: 'Diyetisyen ataması için internet bağlantısı gerekir.' })} />
  </ClientsScreen>
}

type DetailRecords = Record<'anamneses' | 'measurements' | 'goals' | 'labResults' | 'plans' | 'appointments' | 'payments' | 'documents' | 'billingPackages' | 'clientPackages', DomainEntity[]>
const EMPTY_RECORDS: DetailRecords = { anamneses: [], measurements: [], goals: [], labResults: [], plans: [], appointments: [], payments: [], documents: [], billingPackages: [], clientPackages: [] }

export function LocalClientDetailAdapter({ clientId, role, repositories }: { clientId: string; role: ClinicRole; repositories: OgunRepositories }) {
  const [client, setClient] = useState<DomainEntity | null>(null)
  const [records, setRecords] = useState<DetailRecords>(EMPTY_RECORDS)
  useEffect(() => {
    const load = async () => {
      const [nextClient, anamneses, measurements, goals, labResults, plans, appointments, payments, documents, billingPackages, clientPackages] = await Promise.all([repositories.clients.get(clientId), repositories.clinical.listForClient('anamneses', clientId), repositories.clinical.listForClient('measurements', clientId), repositories.clinical.listForClient('goals', clientId), repositories.clinical.listForClient('labResults', clientId), repositories.plans.list(clientId), repositories.appointments.list(), repositories.records.list('payments'), repositories.records.list('documents'), repositories.records.list('billingPackages'), repositories.records.list('clientPackages')])
      setClient(nextClient)
      setRecords({ anamneses, measurements, goals, labResults, plans, appointments: appointments.filter((row) => row.clientId === clientId), payments: payments.filter((row) => row.clientId === clientId), documents: documents.filter((row) => row.clientId === clientId), billingPackages, clientPackages: clientPackages.filter((row) => row.clientId === clientId) })
    }
    void load(); window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [clientId, repositories])
  if (!client) return <ClientDetailLoadingView />

  const readOnly = role === 'assistant'
  const measurements = records.measurements.map((row): ChartMeasurement => ({ id: row.id, measuredAt: String(row.measuredAt ?? row.updatedAt ?? new Date().toISOString()), source: String(row.source ?? 'manuel') as ChartMeasurement['source'], weightKg: numberOrNull(row.weightKg), heightCm: numberOrNull(row.heightCm), waistCm: numberOrNull(row.waistCm), hipCm: numberOrNull(row.hipCm), neckCm: numberOrNull(row.neckCm), armCm: numberOrNull(row.armCm), thighCm: numberOrNull(row.thighCm), chestCm: numberOrNull(row.chestCm), bodyFatPct: numberOrNull(row.bodyFatPct), notes: typeof row.notes === 'string' ? row.notes : null })).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
  const goals = records.goals.filter((row) => row.status !== 'tamamlandı').map((row): ActiveGoalRow => ({ id: row.id, type: String(row.type) as ActiveGoalRow['type'], targetValue: Number(row.targetValue), targetDate: text(row, 'targetDate') || null, startValue: Number(row.startValue), startedAt: String(row.startedAt ?? row.createdAt ?? new Date().toISOString()) }))
  const labResults = records.labResults.map((row): LabResultChartPoint => ({ id: row.id, testedAt: String(row.testedAt ?? row.createdAt ?? new Date().toISOString()), analyte: text(row, 'analyte'), value: Number(row.value ?? 0), unit: text(row, 'unit'), refMin: numberOrNull(row.refMin), refMax: numberOrNull(row.refMax), isAbnormal: typeof row.isAbnormal === 'boolean' ? row.isAbnormal : null }))
  const anamnesis = records.anamneses[0] ?? null
  const healthRecord = { ...(anamnesis ?? {}), healthRecord: anamnesis, legacyConditions: (anamnesis?.conditions as string[] | undefined) ?? [], legacyMedications: (anamnesis?.medications as string[] | undefined) ?? [], conditionSelections: [], medicationSelections: [] } as unknown as ClientHealthRow
  const latest = measurements.at(-1) ?? null
  const nextAppointment = records.appointments.map((row) => date(row.startsAt)).filter((value) => value >= new Date()).sort((a, b) => a.getTime() - b.getTime())[0]
  const clientName = `${text(client, 'firstName')} ${text(client, 'lastName')}`.trim()

  async function saveMeasurement(values: MeasurementFormValues) {
    const projection = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key === 'source' || key === 'measuredAt' || key === 'notes' ? value : numberOrNull(value)]))
    try { await repositories.clinical.upsert('measurements', { id: crypto.randomUUID(), clientId, ...projection, measuredAt: new Date(values.measuredAt).toISOString(), recordedBy: 'local' }); return { success: true } } catch (reason) { return { success: false, error: String(reason) } }
  }
  async function saveAnamnesis(values: AnamnesisFormValues) {
    const entity: DomainEntity = { id: clientId, clientId, conditions: listFromText(values.conditions), medications: listFromText(values.medications), allergies: values.allergies, intolerances: values.intolerances, surgeries: values.surgeries || null, familyHistory: values.familyHistory || null, smokingStatus: values.smokingStatus || null, alcoholUse: values.alcoholUse || null, mealsPerDay: numberOrNull(values.mealsPerDay), eatingOutFrequency: values.eatingOutFrequency || null, waterIntakeMl: numberOrNull(values.waterIntakeMl), activityLevel: values.activityLevel, activityNotes: values.activityNotes || null, sleepHours: numberOrNull(values.sleepHours), sleepQuality: values.sleepQuality || null, bowelHabits: values.bowelHabits || null, updatedAt: new Date().toISOString() }
    try { await repositories.clinical.upsert('anamneses', entity); return { success: true } } catch (reason) { return { success: false, error: String(reason) } }
  }
  async function saveLab(values: LabResultFormValues) {
    const refMin = numberOrNull(values.refMin); const refMax = numberOrNull(values.refMax); const value = Number(values.value)
    try { await repositories.clinical.upsert('labResults', { id: crypto.randomUUID(), clientId, ...values, value, refMin, refMax, testedAt: new Date(values.testedAt).toISOString(), isAbnormal: (refMin !== null && value < refMin) || (refMax !== null && value > refMax) }); return { success: true } } catch (reason) { return { success: false, error: String(reason) } }
  }

  const documents = records.documents.map((row): DocumentRow => ({ id: row.id, fileName: text(row, 'fileName'), mimeType: text(row, 'mimeType'), sizeBytes: Number(row.sizeBytes ?? 0), category: String(row.category ?? 'diğer') as DocumentRow['category'], createdAt: String(row.createdAt ?? new Date().toISOString()) }))
  const billing = { clientPackages: records.clientPackages.map((row) => ({ ...row, id: row.id, clientId, packageId: text(row, 'packageId'), packageName: text(row, 'packageName'), sessionCount: Number(row.sessionCount ?? 0), purchasedAt: date(row.purchasedAt), price: String(row.price ?? '0'), sessionsUsed: Number(row.sessionsUsed ?? 0), expiresAt: row.expiresAt ? date(row.expiresAt) : null, status: String(row.status ?? 'aktif') as 'aktif' | 'tamamlandı' | 'iptal' })), payments: records.payments.map((row) => ({ ...row, id: row.id, clientId, clientName, dietitianId: text(row, 'dietitianId'), dietitianName: text(row, 'dietitianName'), clientPackageId: text(row, 'clientPackageId') || null, amount: String(row.amount ?? '0'), method: String(row.method ?? 'nakit') as 'nakit' | 'kart' | 'havale' | 'online', paidAt: date(row.paidAt), notes: text(row, 'notes') || null, receiptNumber: text(row, 'receiptNumber') || null, receiptSeries: text(row, 'receiptSeries') || null, receiptSequenceNumber: text(row, 'receiptSequenceNumber') || null, receiptIssuedAt: row.receiptIssuedAt ? date(row.receiptIssuedAt) : null })), availablePackages: records.billingPackages.filter((row) => row.isActive !== false).map((row) => ({ id: row.id, name: text(row, 'name'), sessionCount: Number(row.sessionCount ?? 0), price: String(row.price ?? '0') })) } as unknown as ComponentProps<typeof OdemelerView>

  return <ClientDetailView name={clientName} ageLabel={calculateAge(text(client, 'birthDate') || null) !== null ? `${calculateAge(text(client, 'birthDate') || null)} yaş` : 'Yaş —'} sexLabel={text(client, 'sex') || null} phone={text(client, 'phone')} email={text(client, 'email')} summary={[{ label: 'Güncel kilo', value: latest?.weightKg ? `${latest.weightKg} kg` : '—' }, { label: 'BKİ', value: '—' }, { label: 'Hedef', value: goals[0] ? `${goals[0].targetValue} kg` : '—' }, { label: 'Sonraki randevu', value: nextAppointment ? nextAppointment.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—' }]} tabs={[
    { value: 'genel', label: 'Genel', content: <GeneralTabForm client={{ id: client.id, firstName: text(client, 'firstName'), lastName: text(client, 'lastName'), birthDate: text(client, 'birthDate') || null, sex: client.sex === 'male' || client.sex === 'female' ? client.sex : null, phone: text(client, 'phone') || null, email: text(client, 'email') || null, occupation: text(client, 'occupation') || null, referralSource: text(client, 'referralSource') || null, notes: text(client, 'notes') || null, status: client.status === 'pasif' || client.status === 'arşiv' ? client.status : 'aktif', smsConsentAt: client.smsConsentAt ? String(client.smsConsentAt) : null, assignedDietitianId: text(client, 'assignedDietitianId') || null }} dietitians={[]} onSave={async (values) => { if (readOnly) return { success: false, error: 'Salt okunur.' }; try { await repositories.clients.update(clientId, values); return { success: true } } catch (reason) { return { success: false, error: String(reason) } } }} /> },
    { value: 'olcumler', label: 'Ölçümler', content: <MeasurementsView clientId={clientId} measurements={measurements} activeGoals={goals} weightGoal={goals.find((goal) => goal.type === 'kilo') ?? null} onSaveMeasurement={saveMeasurement} onCreateGoal={async (values: GoalFormValues) => { try { await repositories.clinical.upsert('goals', { id: crypto.randomUUID(), clientId, ...values, targetValue: Number(values.targetValue), startValue: Number(values.startValue), startedAt: new Date().toISOString(), status: 'aktif' }); return { success: true } } catch (reason) { return { success: false, error: String(reason) } } }} onAchieveGoal={async (id) => { try { await repositories.records.upsert('goals', { id, clientId, status: 'tamamlandı', achievedAt: new Date().toISOString() }, 'goal.achieve'); return { success: true } } catch (reason) { return { success: false, error: String(reason) } } }} /> },
    { value: 'planlar', label: 'Planlar', content: <ClientPlansView clientId={clientId} plans={records.plans.map((plan) => ({ id: plan.id, name: text(plan, 'name') || 'İsimsiz plan', targetKcal: numberOrNull(plan.targetKcal), status: plan.status === 'aktif' || plan.status === 'arşiv' ? plan.status : 'taslak' }))} /> },
    { value: 'anamnez', label: 'Anamnez', content: <AnamnesisForm healthRecord={healthRecord} onSave={saveAnamnesis} onSearchConditions={async () => []} onSearchMedicationProducts={async () => []} onSearchMedicationSubstances={async () => []} /> },
    { value: 'laboratuvar', label: 'Laboratuvar', content: <LabResultsView results={labResults} onSave={saveLab} onDelete={(id) => repositories.records.remove('labResults', id, 'labResult.delete')} /> },
    { value: 'dosyalar', label: 'Dosyalar', content: <DocumentsView clientId={clientId} documents={documents} previousMeasurement={latest ? { measuredAt: latest.measuredAt, weightKg: latest.weightKg, heightCm: latest.heightCm } : null} uploadPersistence={{ presign: async () => ({ success: false, error: 'Belge yükleme için internet bağlantısı gerekir.' }), confirm: async () => ({ success: false, error: 'Belge yükleme için internet bağlantısı gerekir.' }) }} onSaveMeasurement={saveMeasurement} onViewDocument={async () => ({ success: false, error: 'Belgeyi açmak için internet bağlantısı gerekir.' })} onDeleteDocument={async () => undefined} /> },
    { value: 'randevular', label: 'Randevular', content: <ClientAppointmentsView appointments={records.appointments.map((row) => ({ ...row, id: row.id, startsAt: date(row.startsAt), endsAt: date(row.endsAt), status: String(row.status ?? 'planlandı'), type: String(row.type ?? 'kontrol'), dietitianName: text(row, 'dietitianName') || 'Diyetisyen', location: text(row, 'location') || null, notes: text(row, 'notes') || null })) as never} /> },
    { value: 'odemeler', label: 'Ödemeler', content: <OdemelerView {...billing} onCreatePayment={async (values) => { const id = crypto.randomUUID(); try { await repositories.records.upsert('payments', { id, clientId, ...values, amount: Number(values.amount), paidAt: new Date(values.paidAt).toISOString() }, 'payment.create'); return { success: true } } catch (reason) { return { success: false, error: String(reason) } } }} onPurchasePackage={async () => ({ success: false, error: 'Paket satışı için internet bağlantısı gerekir.' })} /> },
  ]} />
}
