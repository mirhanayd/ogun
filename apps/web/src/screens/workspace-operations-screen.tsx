import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ClipboardList, LayoutDashboard, Plus, UsersRound } from 'lucide-react'
import type { DomainEntity, OgunRepositories } from '@/data/repositories'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FoodSearchInput, type FoodSearchSelection } from '@/components/food-search-input'
import { ScreenFrame } from './screen-frame'

function label(entity: DomainEntity | undefined, key: string): string {
  const value = entity?.[key]
  return typeof value === 'string' ? value : ''
}

function clientName(clients: DomainEntity[], clientId: unknown): string {
  const client = clients.find((item) => item.id === clientId)
  return client ? `${label(client, 'firstName')} ${label(client, 'lastName')}` : 'Danışan'
}

function useRepositoryRows(repository: OgunRepositories) {
  const [data, setData] = useState({ clients: [] as DomainEntity[], plans: [] as DomainEntity[], appointments: [] as DomainEntity[] })
  useEffect(() => {
    const load = async () => {
      const [clients, plans, appointments] = await Promise.all([
        repository.clients.list(),
        repository.plans.list(),
        repository.appointments.list(),
      ])
      setData({ clients, plans, appointments })
    }
    void load()
    window.addEventListener('ogun-local-data-changed', load)
    return () => window.removeEventListener('ogun-local-data-changed', load)
  }, [repository])
  return data
}

export function WorkspaceDashboardScreen({ repository }: { repository: OgunRepositories }) {
  const { clients, plans, appointments } = useRepositoryRows(repository)
  const upcoming = appointments.filter((item) => String(item.startsAt ?? '') >= new Date().toISOString())
  const cards = [
    ['Danışanlar', clients.length, UsersRound],
    ['Aktif planlar', plans.filter((item) => item.status !== 'arşiv').length, ClipboardList],
    ['Yaklaşan randevular', upcoming.length, CalendarDays],
  ] as const
  return (
    <ScreenFrame eyebrow="Klinik özeti" title="Panel" description="Güncel klinik verileriniz bu cihazdaki güvenli çalışma alanından okunur." icon={LayoutDashboard}>
      <div className="grid gap-4 md:grid-cols-3">{cards.map(([title, value, Icon]) => <Card key={title}><CardContent className="flex items-center gap-4 pt-4"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-sm text-muted-foreground">{title}</p></div></CardContent></Card>)}</div>
      <Card><CardHeader><CardTitle>Sıradaki randevular</CardTitle></CardHeader><CardContent className="grid gap-2">{upcoming.slice(0, 5).map((appointment) => <div key={appointment.id} className="flex justify-between rounded-xl border p-3"><span>{clientName(clients, appointment.clientId)}</span><span className="text-sm text-muted-foreground">{new Date(String(appointment.startsAt)).toLocaleString('tr-TR')}</span></div>)}{upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Yaklaşan randevu yok.</p> : null}</CardContent></Card>
    </ScreenFrame>
  )
}

function PlanForm({
  clients,
  plan,
  onSave,
}: {
  clients: DomainEntity[]
  plan?: DomainEntity
  onSave: (plan: DomainEntity, draft: Record<string, unknown>) => Promise<void>
}) {
  const [clientId, setClientId] = useState(String(plan?.clientId ?? clients[0]?.id ?? ''))
  const [name, setName] = useState(label(plan, 'name'))
  const [targetKcal, setTargetKcal] = useState(plan?.targetKcal ? String(plan.targetKcal) : '')
  const [notes, setNotes] = useState(label(plan, 'notes'))
  const [selectedFoods, setSelectedFoods] = useState<FoodSearchSelection[]>([])
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const planId = plan?.id ?? crypto.randomUUID()
      const existingDraft = plan?.draft as Record<string, unknown> | undefined
      const dayId = crypto.randomUUID()
      const mealId = crypto.randomUUID()
      const draft = structuredClone(existingDraft ?? {
        planId,
        planName: name,
        targetKcal: targetKcal ? Number(targetKcal) : null,
        startDate: null,
        endDate: null,
        outputFormat: 'besin_listesi',
        days: [{ id: dayId, dayNumber: 1, dayLabel: '1. Gün', meals: [{ id: mealId, dayId, mealType: 'kahvaltı', time: '08:00', name: 'Kahvaltı', sortOrder: 0, items: [] }] }],
      }) as Record<string, unknown> & { days: Array<{ id: string; dayNumber: number; meals: Array<{ id: string; items: Array<Record<string, unknown>> }> }> }
      draft.planName = name
      draft.targetKcal = targetKcal ? Number(targetKcal) : null
      const meal = draft.days[0]?.meals[0]
      if (meal) {
        for (const selection of selectedFoods) {
          meal.items.push({ id: `temp-${crypto.randomUUID()}`, mealId: meal.id, foodId: selection.foodId, recipeId: null, freeText: null, amountGrams: selection.amount || selection.defaultPortion?.grams || 100, note: null, sortOrder: meal.items.length, isOptional: false, alternatives: [] })
        }
      }
      await onSave({
        ...plan,
        id: planId,
        clientId,
        name,
        targetKcal: targetKcal ? Number(targetKcal) : null,
        notes: notes || null,
        status: plan?.status ?? 'taslak',
        createdAt: plan?.createdAt ?? new Date().toISOString(),
        ...(!existingDraft ? { skeleton: { days: draft.days.map((day) => ({ id: day.id, dayNumber: day.dayNumber, dayLabel: '1. Gün', meals: day.meals.map((draftMeal) => ({ id: draftMeal.id, mealType: 'kahvaltı', time: '08:00', name: 'Kahvaltı', sortOrder: 0 })) })) } } : {}),
      }, draft)
    } finally {
      setBusy(false)
    }
  }
  return <form onSubmit={submit} className="grid gap-4"><div className="grid gap-2"><Label htmlFor="plan-client">Danışan</Label><select id="plan-client" className="h-9 rounded-lg border bg-background px-3 text-sm" value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={Boolean(plan)} required>{clients.map((client) => <option key={client.id} value={client.id}>{clientName(clients, client.id)}</option>)}</select></div><div className="grid gap-2"><Label htmlFor="plan-name">Plan adı</Label><Input id="plan-name" value={name} onChange={(event) => setName(event.target.value)} required /></div><div className="grid gap-2"><Label htmlFor="plan-kcal">Hedef enerji (kcal)</Label><Input id="plan-kcal" type="number" min={500} max={10000} value={targetKcal} onChange={(event) => setTargetKcal(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="plan-notes">Notlar</Label><Input id="plan-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div><div className="grid gap-2"><Label>Plana besin ekle</Label><FoodSearchInput onSelect={(selection) => setSelectedFoods((rows) => [...rows, selection])} placeholder="Besin ara ve kahvaltıya ekle…" showLatencyBadge={false} />{selectedFoods.map((food) => <div key={`${food.foodId}-${food.nameTr}`} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{food.nameTr} · {food.amount || food.defaultPortion?.grams || 100} g</div>)}</div><Button disabled={busy || !clientId}>{busy ? 'Kaydediliyor…' : plan ? 'Planı güncelle' : 'Planı oluştur'}</Button></form>
}

export function PlansWorkspaceScreen({ repository, readOnly = false }: { repository: OgunRepositories; readOnly?: boolean }) {
  const { clients, plans } = useRepositoryRows(repository)
  const [editing, setEditing] = useState<DomainEntity | 'new' | null>(null)
  return (
    <ScreenFrame eyebrow="Beslenme planları" title="Planlar" description="Planları görüntüleyin ve desteklenen alanları bağlantı olmasa da güvenle düzenleyin." icon={ClipboardList} actions={readOnly ? undefined : <Button onClick={() => setEditing('new')} disabled={clients.length === 0}><Plus />Yeni plan</Button>}>
      {editing ? <Card><CardHeader><CardTitle>{editing === 'new' ? 'Yeni plan' : 'Planı düzenle'}</CardTitle></CardHeader><CardContent><PlanForm clients={clients} plan={editing === 'new' ? undefined : editing} onSave={async (plan, draft) => { await repository.plans.upsert(plan); await repository.plans.replaceDraft(plan.id, draft); setEditing(null) }} /></CardContent></Card> : null}
      <div className="grid gap-3 lg:grid-cols-2">{plans.map((plan) => <button key={plan.id} type="button" onClick={() => { if (!readOnly) setEditing(plan) }} className="rounded-2xl border bg-card p-5 text-left shadow-sm transition-colors hover:bg-muted/35"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold">{label(plan, 'name')}</h2><p className="mt-1 text-sm text-muted-foreground">{clientName(clients, plan.clientId)}</p></div><Badge variant={plan.status === 'aktif' ? 'default' : 'secondary'}>{label(plan, 'status') || 'taslak'}</Badge></div><div className="mt-4 border-t pt-3 text-sm text-muted-foreground">{plan.targetKcal ? `${plan.targetKcal} kcal` : 'Enerji hedefi yok'} · {readOnly ? 'Salt okunur' : 'Görüntülemek/düzenlemek için aç'}</div></button>)}{plans.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground lg:col-span-2">Henüz plan yok.</div> : null}</div>
    </ScreenFrame>
  )
}

function toInputDate(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function AppointmentsWorkspaceScreen({ repository }: { repository: OgunRepositories }) {
  const { clients, appointments } = useRepositoryRows(repository)
  const [creating, setCreating] = useState(false)
  const [clientId, setClientId] = useState('')
  const [startsAt, setStartsAt] = useState(toInputDate(new Date(Date.now() + 3_600_000)))
  const sorted = useMemo(() => [...appointments].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt))), [appointments])
  async function create(event: React.FormEvent) {
    event.preventDefault()
    const start = new Date(startsAt)
    const end = new Date(start.getTime() + 60 * 60_000)
    await repository.appointments.upsert({ id: crypto.randomUUID(), clientId, startsAt: start.toISOString(), endsAt: end.toISOString(), type: 'kontrol', status: 'planlandı', notes: null, createdAt: new Date().toISOString() })
    setCreating(false)
  }
  return (
    <ScreenFrame eyebrow="Klinik takvimi" title="Randevular" description="Randevular cihazdaki takvimden okunur; yeni kayıtlar bağlantı geldiğinde eşitlenir." icon={CalendarDays} actions={<Button onClick={() => { setClientId(clients[0]?.id ?? ''); setCreating(true) }} disabled={clients.length === 0}><Plus />Yeni randevu</Button>}>
      {creating ? <Card><CardHeader><CardTitle>Yeni randevu</CardTitle></CardHeader><CardContent><form onSubmit={create} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]"><select aria-label="Danışan" className="h-9 rounded-lg border bg-background px-3 text-sm" value={clientId} onChange={(event) => setClientId(event.target.value)} required>{clients.map((client) => <option key={client.id} value={client.id}>{clientName(clients, client.id)}</option>)}</select><Input aria-label="Başlangıç" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /><Button>Kaydet</Button></form></CardContent></Card> : null}
      <div className="grid gap-3">{sorted.map((appointment) => <Card key={appointment.id}><CardContent className="flex items-center gap-4 pt-4"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays /></span><div className="min-w-0 flex-1"><p className="font-semibold">{clientName(clients, appointment.clientId)}</p><p className="text-sm text-muted-foreground">{new Date(String(appointment.startsAt)).toLocaleString('tr-TR')} · {label(appointment, 'type')}</p></div><Badge variant="secondary">{label(appointment, 'status') || 'planlandı'}</Badge></CardContent></Card>)}{sorted.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Henüz randevu yok.</div> : null}</div>
    </ScreenFrame>
  )
}
