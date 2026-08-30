import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ClinicRole, DomainEntity, OgunRepositories } from '@/data/repositories'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NavigationLink } from '@/components/navigation-link'
import { calculateAge } from '@/lib/client-age'
import { ClientsScreen } from '@/screens/clients-screen'
import { ClientsTableView, type ClientsFilters } from '@/screens/clients-table-view'
import { ClientDetailView } from '@/screens/client-detail-view'

function text(entity: DomainEntity, key: string): string {
  return typeof entity[key] === 'string' ? String(entity[key]) : ''
}

function displayDate(value: unknown): string {
  return typeof value === 'string' && value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value)) : '—'
}

function LocalClientForm({ repository, onSaved }: { repository: OgunRepositories['clients']; onSaved: (id: string) => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true)
    const id = crypto.randomUUID()
    try { await repository.create({ id, firstName: firstName.trim(), lastName: lastName.trim() }); onSaved(id) } finally { setBusy(false) }
  }
  return <Card><CardHeader><CardTitle>Yeni danışan</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="local-first-name">Ad</Label><Input id="local-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="local-last-name">Soyad</Label><Input id="local-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required /></div><Button disabled={busy} className="sm:col-span-2">{busy ? 'Kaydediliyor…' : 'Danışanı kaydet'}</Button></form></CardContent></Card>
}

export function LocalClientsAdapter({ role, repository, onOpen }: { role: ClinicRole; repository: OgunRepositories['clients']; onOpen: (id: string) => void }) {
  const [clients, setClients] = useState<DomainEntity[]>([])
  const [filters, setFilters] = useState<ClientsFilters>({ search: '', status: '', assignedDietitianId: '' })
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    const load = () => void repository.list().then(setClients)
    load(); window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [repository])
  const filtered = useMemo(() => clients.filter((client) => {
    const haystack = [client.firstName, client.lastName, client.phone, client.email].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR')
    return (!filters.search || haystack.includes(filters.search.toLocaleLowerCase('tr-TR'))) && (!filters.status || client.status === filters.status)
  }), [clients, filters])
  return <ClientsScreen role={role} actions={role === 'assistant' ? undefined : <Button onClick={() => setCreating((value) => !value)}><Plus />Yeni danışan</Button>}>
    {creating ? <LocalClientForm repository={repository} onSaved={(id) => { setCreating(false); onOpen(id) }} /> : null}
    <ClientsTableView
      result={{ rows: filtered.map((client) => ({ id: client.id, firstName: text(client, 'firstName'), lastName: text(client, 'lastName'), birthDate: text(client, 'birthDate') || null, status: client.status === 'pasif' || client.status === 'arşiv' ? client.status : 'aktif', assignedDietitianId: text(client, 'assignedDietitianId') || null, assignedDietitianName: text(client, 'assignedDietitianName') || null, createdAt: new Date(String(client.createdAt ?? new Date().toISOString())) })), total: filtered.length, page: 1, pageSize: Math.max(filtered.length, 1) }}
      dietitians={[]} role={role} filters={filters} onNavigate={setFilters}
      onArchive={async (ids) => { try { await Promise.all(ids.map((id) => repository.archive(id))); return { success: true } } catch (reason) { return { success: false, error: String(reason) } } }}
      onAssign={async () => ({ success: false, error: 'Diyetisyen ataması çevrimdışıyken kullanılamıyor.' })}
    />
  </ClientsScreen>
}

function LocalClientEdit({ client, repository }: { client: DomainEntity; repository: OgunRepositories['clients'] }) {
  const [firstName, setFirstName] = useState(text(client, 'firstName'))
  const [lastName, setLastName] = useState(text(client, 'lastName'))
  const [phone, setPhone] = useState(text(client, 'phone'))
  const [email, setEmail] = useState(text(client, 'email'))
  async function submit(event: React.FormEvent) { event.preventDefault(); await repository.update(client.id, { firstName, lastName, phone, email }) }
  return <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><Input aria-label="Ad" value={firstName} onChange={(event) => setFirstName(event.target.value)} /><Input aria-label="Soyad" value={lastName} onChange={(event) => setLastName(event.target.value)} /><Input aria-label="Telefon" value={phone} onChange={(event) => setPhone(event.target.value)} /><Input aria-label="E-posta" value={email} onChange={(event) => setEmail(event.target.value)} /><Button className="sm:col-span-2">Değişiklikleri kaydet</Button></form>
}

function Empty({ label }: { label: string }) { return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{label}</div> }

function LocalClinicalTab({ domain, clientId, records, repository, readOnly }: { domain: 'anamneses' | 'measurements' | 'labResults'; clientId: string; records: DomainEntity[]; repository: OgunRepositories['clinical']; readOnly: boolean }) {
  const [primary, setPrimary] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const now = new Date().toISOString()
    const id = domain === 'anamneses' ? clientId : crypto.randomUUID()
    const payload = domain === 'measurements' ? { id, clientId, weightKg: Number(primary), measuredAt: now } : domain === 'labResults' ? { id, clientId, analyte: primary, value: 0, testedAt: now } : { id, clientId, conditions: primary.split(',').map((value) => value.trim()).filter(Boolean), updatedAt: now }
    await repository.upsert(domain, payload); setPrimary('')
  }
  return <div className="grid gap-3">{!readOnly ? <form onSubmit={submit} className="flex gap-2 rounded-xl border bg-muted/20 p-4"><Input value={primary} onChange={(event) => setPrimary(event.target.value)} placeholder="Yeni kayıt" required /><Button>Kaydet</Button></form> : null}{records.map((record) => <Card key={record.id}><CardContent className="pt-4"><p className="font-medium">{domain === 'measurements' ? `${record.weightKg} kg` : domain === 'labResults' ? String(record.analyte ?? 'Tahlil') : ((record.conditions as string[] | undefined)?.join(', ') || 'Anamnez kaydı')}</p><p className="text-xs text-muted-foreground">{displayDate(record.measuredAt ?? record.testedAt ?? record.updatedAt)}</p></CardContent></Card>)}{records.length === 0 ? <Empty label="Henüz kayıt yok." /> : null}</div>
}

export function LocalClientDetailAdapter({ clientId, role, repositories, onBack }: { clientId: string; role: ClinicRole; repositories: OgunRepositories; onBack: () => void }) {
  const [client, setClient] = useState<DomainEntity | null>(null)
  const [records, setRecords] = useState({ anamneses: [] as DomainEntity[], measurements: [] as DomainEntity[], labResults: [] as DomainEntity[], plans: [] as DomainEntity[], appointments: [] as DomainEntity[] })
  useEffect(() => {
    const load = async () => {
      const [nextClient, anamneses, measurements, labResults, plans, appointments] = await Promise.all([repositories.clients.get(clientId), repositories.clinical.listForClient('anamneses', clientId), repositories.clinical.listForClient('measurements', clientId), repositories.clinical.listForClient('labResults', clientId), repositories.plans.list(), repositories.appointments.list()])
      setClient(nextClient); setRecords({ anamneses, measurements, labResults, plans: plans.filter((row) => row.clientId === clientId), appointments: appointments.filter((row) => row.clientId === clientId) })
    }
    void load(); window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [clientId, repositories])
  if (!client) return <div className="rounded-2xl border p-8">Danışan yükleniyor…</div>
  const latest = records.measurements[0]
  const nextAppointment = records.appointments.map((row) => new Date(String(row.startsAt ?? ''))).filter((date) => date >= new Date()).sort((a, b) => a.getTime() - b.getTime())[0]
  const name = `${text(client, 'firstName')} ${text(client, 'lastName')}`
  const age = calculateAge(text(client, 'birthDate') || null)
  return <ClientDetailView name={name} ageLabel={age !== null ? `${age} yaş` : 'Yaş —'} sexLabel={text(client, 'sex') || null} phone={text(client, 'phone')} email={text(client, 'email')}
    summary={[{ label: 'Güncel kilo', value: latest?.weightKg ? `${latest.weightKg} kg` : '—' }, { label: 'BKİ', value: typeof latest?.bmi === 'number' ? latest.bmi.toFixed(1) : '—' }, { label: 'Hedef', value: '—' }, { label: 'Sonraki randevu', value: nextAppointment ? nextAppointment.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—' }]}
    tabs={[
      { value: 'genel', label: 'Genel', content: <Card><CardContent className="pt-4">{role !== 'assistant' ? <LocalClientEdit client={client} repository={repositories.clients} /> : <Empty label="Salt okunur" />}</CardContent></Card> },
      { value: 'olcumler', label: 'Ölçümler', content: <LocalClinicalTab domain="measurements" clientId={clientId} records={records.measurements} repository={repositories.clinical} readOnly={role === 'assistant'} /> },
      { value: 'planlar', label: 'Planlar', content: <div className="grid gap-3">{records.plans.map((plan) => <NavigationLink key={plan.id} href={`/danisanlar/${clientId}/planlar/${plan.id}`} className="rounded-xl border bg-card p-4 font-medium">{text(plan, 'name') || 'İsimsiz plan'}</NavigationLink>)}{records.plans.length === 0 ? <Empty label="Henüz plan yok." /> : null}</div> },
      { value: 'anamnez', label: 'Anamnez', content: <LocalClinicalTab domain="anamneses" clientId={clientId} records={records.anamneses} repository={repositories.clinical} readOnly={role === 'assistant'} /> },
      { value: 'laboratuvar', label: 'Laboratuvar', content: <LocalClinicalTab domain="labResults" clientId={clientId} records={records.labResults} repository={repositories.clinical} readOnly={role === 'assistant'} /> },
      { value: 'dosyalar', label: 'Dosyalar', content: <Empty label="Dosya kayıtları bağlantı geldiğinde eşitlenecek." /> },
      { value: 'randevular', label: 'Randevular', content: <div className="grid gap-3">{records.appointments.map((row) => <Card key={row.id}><CardContent className="pt-4">{displayDate(row.startsAt)} · {text(row, 'type')}</CardContent></Card>)}{records.appointments.length === 0 ? <Empty label="Henüz randevu yok." /> : null}</div> },
      { value: 'odemeler', label: 'Ödemeler', content: <Empty label="Ödeme kayıtları bağlantı geldiğinde eşitlenecek." /> },
    ]}
    quickActions={<><Button onClick={onBack} variant="outline" className="w-full">Danışanlara dön</Button><NavigationLink href="/planlar" className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Planları aç</NavigationLink></>}
  />
}
