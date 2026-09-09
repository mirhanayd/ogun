import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { listSupportTicketsForClinic } from '@ogun/db/queries'
import { SUPPORT_AREA_LABELS, SUPPORT_IMPACT_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_TICKET_AREAS, SUPPORT_TICKET_TYPES, SUPPORT_TYPE_LABELS } from '@ogun/db/support'
import { requireClinic } from '@/lib/authz'
import { createSupportTicketAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function ClinicSupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireClinic()
  if (ctx.role !== 'owner') redirect('/ayarlar')
  const [tickets, params] = await Promise.all([listSupportTicketsForClinic(db, ctx.scope.clinicId), searchParams])
  const open = tickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status))
  const history = tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status))
  return <div className="space-y-6 pb-10"><header><Link className="text-sm text-primary" href="/ayarlar">← Ayarlar</Link><h1 className="mt-2 text-3xl font-semibold">Destek & Geri Bildirim</h1><p className="text-muted-foreground">Sorunları, şikayetleri ve ürün önerilerini Ogun ekibine iletin.</p></header>
    {params.hata ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{params.hata}</p> : null}
    <section className="rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">Yeni talep oluştur</h2><p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Destek talebinizde danışan adı, T.C. kimlik numarası veya gereksiz sağlık verisi paylaşmayın.</p>
      <form action={createSupportTicketAction} className="mt-4 grid gap-4 md:grid-cols-2"><input type="hidden" name="clientRequestId" value={randomUUID()} /><label className="grid gap-1 text-sm">Tür<select name="type" required className="rounded-md border bg-background p-2">{SUPPORT_TICKET_TYPES.map((value) => <option value={value} key={value}>{SUPPORT_TYPE_LABELS[value]}</option>)}</select></label><label className="grid gap-1 text-sm">Bildirilen etki<select name="reportedImpact" required className="rounded-md border bg-background p-2">{Object.entries(SUPPORT_IMPACT_LABELS).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="grid gap-1 text-sm md:col-span-2">Başlık<input name="title" required minLength={5} maxLength={160} className="rounded-md border bg-background p-2" /></label><label className="grid gap-1 text-sm">İlgili alan<select name="area" required className="rounded-md border bg-background p-2">{SUPPORT_TICKET_AREAS.map((value) => <option value={value} key={value}>{SUPPORT_AREA_LABELS[value]}</option>)}</select></label><label className="grid gap-1 text-sm">Diğer alan <span className="text-muted-foreground">(yalnız “Diğer” seçildiğinde)</span><input name="otherArea" maxLength={80} className="rounded-md border bg-background p-2" /></label><label className="grid gap-1 text-sm md:col-span-2">Açıklama<textarea name="body" required minLength={20} maxLength={5000} rows={6} className="rounded-md border bg-background p-2" /></label><button className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground" type="submit">Talebi gönder</button></form>
    </section><TicketList title="Açık talepler" tickets={open} /><TicketList title="Geçmiş talepler" tickets={history} /></div>
}

function TicketList({ title, tickets }: { title: string; tickets: Awaited<ReturnType<typeof listSupportTicketsForClinic>> }) {
  return <section><h2 className="mb-3 text-xl font-semibold">{title}</h2>{tickets.length === 0 ? <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Henüz destek talebiniz yok. Bir sorun veya öneriniz olduğunda buradan Ogun ekibine iletebilirsiniz.</div> : <div className="grid gap-3">{tickets.map((ticket) => <Link href={`/ayarlar/destek/${ticket.id}`} key={ticket.id} className="rounded-xl border bg-card p-4 transition hover:shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{ticket.referenceCode} · {ticket.title}</strong><span className="rounded-full bg-muted px-2 py-1 text-xs">{SUPPORT_STATUS_LABELS[ticket.status]}</span></div><p className="mt-2 text-sm text-muted-foreground">{SUPPORT_TYPE_LABELS[ticket.type]} · {SUPPORT_AREA_LABELS[ticket.area]} · {SUPPORT_IMPACT_LABELS[ticket.reportedImpact]}</p><p className="mt-1 text-xs text-muted-foreground">Son aktivite: {ticket.lastActivityAt.toLocaleString('tr-TR')}</p></Link>)}</div>}</section>
}
