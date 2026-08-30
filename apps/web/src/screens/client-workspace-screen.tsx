import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FlaskConical, Plus, Target, UserRound, Weight } from 'lucide-react'
import type { ClinicRole, DomainEntity, OgunRepositories } from '@/data/repositories'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ClientsScreen } from './clients-screen'
import { ClientsTableView, type ClientsFilters } from './clients-table-view'

type DetailTab = 'summary' | 'anamnesis' | 'measurements' | 'goals' | 'labs'

function text(entity: DomainEntity, key: string): string {
  const value = entity[key]
  return typeof value === 'string' ? value : ''
}

function displayDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value))
}

function ClientForm({ repository, onSaved }: { repository: OgunRepositories['clients']; onSaved: (id: string) => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!firstName.trim() || !lastName.trim()) return
    const id = crypto.randomUUID()
    setBusy(true)
    setError(null)
    try {
      await repository.create({ id, firstName: firstName.trim(), lastName: lastName.trim(), phone, email })
      onSaved(id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Yeni danışan</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="client-first-name">Ad</Label><Input id="client-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></div>
          <div className="grid gap-2"><Label htmlFor="client-last-name">Soyad</Label><Input id="client-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required /></div>
          <div className="grid gap-2"><Label htmlFor="client-phone">Telefon</Label><Input id="client-phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="client-email">E-posta</Label><Input id="client-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
          <div className="sm:col-span-2"><Button disabled={busy}>{busy ? 'Kaydediliyor…' : 'Danışanı kaydet'}</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}

function ClientEditForm({
  client,
  repository,
}: {
  client: DomainEntity
  repository: OgunRepositories['clients']
}) {
  const [firstName, setFirstName] = useState(text(client, 'firstName'))
  const [lastName, setLastName] = useState(text(client, 'lastName'))
  const [phone, setPhone] = useState(text(client, 'phone'))
  const [email, setEmail] = useState(text(client, 'email'))
  const [saved, setSaved] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    await repository.update(client.id, { firstName, lastName, phone, email })
    setSaved(true)
  }

  return <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="edit-first-name">Ad</Label><Input id="edit-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="edit-last-name">Soyad</Label><Input id="edit-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="edit-phone">Telefon</Label><Input id="edit-phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="edit-email">E-posta</Label><Input id="edit-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="flex items-center gap-3 sm:col-span-2"><Button>Değişiklikleri kaydet</Button>{saved ? <span className="text-xs text-emerald-600">Cihazda kaydedildi.</span> : null}</div></form>
}

export function ClientCollectionScreen({
  role,
  repository,
  onOpen,
}: {
  role: ClinicRole
  repository: OgunRepositories['clients']
  onOpen: (id: string) => void
}) {
  const [clients, setClients] = useState<DomainEntity[]>([])
  const [filters, setFilters] = useState<ClientsFilters>({ search: '', status: '', assignedDietitianId: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const load = () => void repository.list().then(setClients)
    load()
    window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [repository])

  const filtered = useMemo(() => clients.filter((client) => {
    const haystack = [client.firstName, client.lastName, client.phone, client.email].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR')
    return (!filters.search || haystack.includes(filters.search.toLocaleLowerCase('tr-TR'))) && (!filters.status || client.status === filters.status)
  }), [clients, filters])

  return (
    <ClientsScreen
      role={role}
      actions={role === 'assistant' ? undefined : <Button onClick={() => setCreating((value) => !value)}><Plus />Yeni danışan</Button>}
    >
      {creating ? <ClientForm repository={repository} onSaved={(id) => { setCreating(false); onOpen(id) }} /> : null}
      <ClientsTableView
        result={{ rows: filtered.map((client) => ({ id: client.id, firstName: text(client, 'firstName'), lastName: text(client, 'lastName'), birthDate: text(client, 'birthDate') || null, status: client.status === 'pasif' || client.status === 'arşiv' ? client.status : 'aktif', assignedDietitianId: typeof client.assignedDietitianId === 'string' ? client.assignedDietitianId : null, assignedDietitianName: typeof client.assignedDietitianName === 'string' ? client.assignedDietitianName : null, createdAt: new Date(String(client.createdAt ?? new Date().toISOString())) })), total: filtered.length, page: 1, pageSize: Math.max(filtered.length, 1) }}
        dietitians={[]}
        role={role}
        filters={filters}
        onNavigate={(next) => setFilters(next)}
        onArchive={async (ids) => { try { await Promise.all(ids.map((id) => repository.archive(id))); return { success: true } } catch (reason) { return { success: false, error: String(reason) } } }}
        onAssign={async () => ({ success: false, error: 'Diyetisyen ataması çevrimdışıyken kullanılamıyor.' })}
      />
    </ClientsScreen>
  )
}

function ClinicalCreateForm({
  tab,
  clientId,
  repository,
}: {
  tab: Exclude<DetailTab, 'summary'>
  clientId: string
  repository: OgunRepositories['clinical']
}) {
  const [primary, setPrimary] = useState('')
  const [secondary, setSecondary] = useState('')
  const [error, setError] = useState<string | null>(null)
  const labels = {
    anamnesis: ['Sağlık durumları (virgülle ayırın)', 'İlaçlar (virgülle ayırın)'],
    measurements: ['Kilo (kg)', 'Boy (cm, isteğe bağlı)'],
    goals: ['Hedef kilo', 'Başlangıç kilosu'],
    labs: ['Analit (örn. HbA1c)', 'Değer'],
  }[tab]

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const now = new Date().toISOString()
    const id = tab === 'anamnesis' ? clientId : crypto.randomUUID()
    let domain: 'anamneses' | 'measurements' | 'goals' | 'labResults'
    let entity: DomainEntity
    if (tab === 'anamnesis') {
      domain = 'anamneses'
      entity = { id, clientId, conditions: primary.split(',').map((value) => value.trim()).filter(Boolean), medications: secondary.split(',').map((value) => value.trim()).filter(Boolean), allergies: [], intolerances: [], surgeries: null, familyHistory: null, smokingStatus: null, alcoholUse: null, mealsPerDay: null, eatingOutFrequency: null, waterIntakeMl: null, activityLevel: null, activityNotes: null, sleepHours: null, sleepQuality: null, bowelHabits: null, updatedAt: now }
    } else if (tab === 'measurements') {
      domain = 'measurements'
      entity = { id, clientId, measuredAt: now, source: 'manuel', weightKg: Number(primary), heightCm: secondary ? Number(secondary) : null, notes: null, createdAt: now }
    } else if (tab === 'goals') {
      domain = 'goals'
      entity = { id, clientId, type: 'kilo', targetValue: Number(primary), startValue: Number(secondary), targetDate: null, startedAt: now, createdAt: now }
    } else {
      domain = 'labResults'
      entity = { id, clientId, testedAt: now, analyte: primary, value: Number(secondary), unit: 'mg/dL', refMin: null, refMax: null, labName: null, notes: null, createdAt: now }
    }
    setError(null)
    try {
      await repository.upsert(domain, entity)
      setPrimary('')
      setSecondary('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[1fr_1fr_auto]"><Input type={tab === 'measurements' || tab === 'goals' ? 'number' : 'text'} step="any" aria-label={labels[0]} placeholder={labels[0]} value={primary} onChange={(event) => setPrimary(event.target.value)} required /><Input type={tab === 'measurements' || tab === 'goals' || tab === 'labs' ? 'number' : 'text'} step="any" aria-label={labels[1]} placeholder={labels[1]} value={secondary} onChange={(event) => setSecondary(event.target.value)} required={tab === 'goals' || tab === 'labs'} /><Button>Kaydet</Button>{error ? <p className="text-xs text-destructive sm:col-span-3">{error}</p> : null}</form>
}

export function ClientDetailScreen({
  clientId,
  role,
  repositories,
  onBack,
}: {
  clientId: string
  role: ClinicRole
  repositories: OgunRepositories
  onBack: () => void
}) {
  const [client, setClient] = useState<DomainEntity | null>(null)
  const [records, setRecords] = useState<Record<string, DomainEntity[]>>({})
  const [tab, setTab] = useState<DetailTab>('summary')

  useEffect(() => {
    const load = async () => {
      const [nextClient, anamneses, measurements, goals, labResults] = await Promise.all([
        repositories.clients.get(clientId),
        repositories.clinical.listForClient('anamneses', clientId),
        repositories.clinical.listForClient('measurements', clientId),
        repositories.clinical.listForClient('goals', clientId),
        repositories.clinical.listForClient('labResults', clientId),
      ])
      setClient(nextClient)
      setRecords({ anamnesis: anamneses, measurements, goals, labs: labResults })
    }
    void load()
    window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [clientId, repositories])

  if (!client) return <div className="rounded-2xl border p-8">Danışan yükleniyor…</div>
  const tabs: Array<[DetailTab, string, typeof UserRound]> = [['summary', 'Genel', UserRound], ['anamnesis', 'Anamnez', UserRound], ['measurements', 'Ölçümler', Weight], ['goals', 'Hedefler', Target], ['labs', 'Laboratuvar', FlaskConical]]
  const activeRecords = records[tab] ?? []

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-4 border-b pb-5"><Button variant="outline" size="icon" onClick={onBack}><ArrowLeft /></Button><div><p className="text-xs font-semibold tracking-widest text-primary uppercase">Danışan profili</p><h1 className="text-3xl font-semibold">{text(client, 'firstName')} {text(client, 'lastName')}</h1></div></header>
      <div className="flex flex-wrap gap-2">{tabs.map(([value, label, Icon]) => <Button key={value} variant={tab === value ? 'default' : 'outline'} onClick={() => setTab(value)}><Icon />{label}</Button>)}</div>
      {tab === 'summary' ? <Card><CardHeader><CardTitle>Genel bilgiler</CardTitle></CardHeader><CardContent>{role !== 'assistant' ? <ClientEditForm client={client} repository={repositories.clients} /> : <div className="grid gap-4 sm:grid-cols-2"><div><span className="text-xs text-muted-foreground">Telefon</span><p>{text(client, 'phone') || '—'}</p></div><div><span className="text-xs text-muted-foreground">E-posta</span><p>{text(client, 'email') || '—'}</p></div><div><span className="text-xs text-muted-foreground">Doğum tarihi</span><p>{displayDate(client.birthDate)}</p></div><div><span className="text-xs text-muted-foreground">Durum</span><p>{text(client, 'status') || 'aktif'}</p></div></div>}</CardContent></Card> : <>{role !== 'assistant' ? <ClinicalCreateForm tab={tab} clientId={clientId} repository={repositories.clinical} /> : <p className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">Bu rol klinik kayıtları görüntüleyebilir; değişiklik yapamaz.</p>}<div className="grid gap-3">{activeRecords.map((record) => <Card key={record.id}><CardContent className="flex items-center justify-between pt-4"><div><p className="font-medium">{tab === 'measurements' ? `${record.weightKg} kg` : tab === 'goals' ? `${record.targetValue} kg hedef` : tab === 'labs' ? `${record.analyte}: ${record.value} ${record.unit}` : ((record.conditions as string[] | undefined)?.join(', ') || 'Anamnez kaydı')}</p><p className="text-xs text-muted-foreground">{displayDate(record.measuredAt ?? record.testedAt ?? record.startedAt ?? record.updatedAt)}</p></div></CardContent></Card>)}{activeRecords.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Henüz kayıt yok.</div> : null}</div></>}
    </div>
  )
}
