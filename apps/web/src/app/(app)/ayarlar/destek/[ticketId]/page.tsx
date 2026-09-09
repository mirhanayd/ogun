import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { getPublicSupportMessagesForClinic, getSupportTicketForClinic } from '@ogun/db/queries'
import { SUPPORT_AREA_LABELS, SUPPORT_IMPACT_LABELS, SUPPORT_STATUS_LABELS, SUPPORT_TYPE_LABELS } from '@ogun/db/support'
import { requireClinic } from '@/lib/authz'
import { reopenSupportTicketAction, replySupportTicketAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function ClinicSupportDetailPage({ params, searchParams }: { params: Promise<{ ticketId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireClinic()
  if (ctx.role !== 'owner') redirect('/ayarlar')
  const { ticketId } = await params
  const [ticket, messages, query] = await Promise.all([getSupportTicketForClinic(db, ctx.scope.clinicId, ticketId), getPublicSupportMessagesForClinic(db, ctx.scope.clinicId, ticketId), searchParams])
  if (!ticket) notFound()
  return <div className="space-y-6 pb-10"><header><Link className="text-sm text-primary" href="/ayarlar/destek">← Destek talepleri</Link><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">{ticket.referenceCode}</h1><span className="rounded-full bg-muted px-3 py-1 text-sm">{SUPPORT_STATUS_LABELS[ticket.status]}</span></div><p className="mt-2 text-xl">{ticket.title}</p><p className="text-sm text-muted-foreground">{SUPPORT_TYPE_LABELS[ticket.type]} · {SUPPORT_AREA_LABELS[ticket.area]}{ticket.otherArea ? ` (${ticket.otherArea})` : ''} · {SUPPORT_IMPACT_LABELS[ticket.reportedImpact]}</p></header>
    {query.mesaj ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{query.mesaj}</p> : null}{query.hata ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{query.hata}</p> : null}{query.mail ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{query.mail}</p> : null}
    <section className="space-y-3" aria-label="Destek konuşması">{messages.map((message) => <article key={message.id} className="rounded-xl border bg-card p-4"><div className="flex justify-between gap-3 text-xs text-muted-foreground"><strong className="text-foreground">{message.authorName}</strong><time>{message.createdAt.toLocaleString('tr-TR')}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.body}</p></article>)}</section>
    {ticket.status === 'resolved' ? <form action={reopenSupportTicketAction} className="rounded-xl border bg-card p-4"><input type="hidden" name="ticketId" value={ticket.id} /><p className="mb-3 text-sm">Sorun çözüldü olarak işaretlendi. Devam ediyorsa talebi yeniden açabilirsiniz.</p><button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Sorun devam ediyor</button></form> : ticket.status === 'closed' ? <p className="rounded-xl border bg-muted/40 p-4 text-sm">Bu talep kapatılmıştır; yeni yanıt eklenemez.</p> : <form action={replySupportTicketAction} className="rounded-xl border bg-card p-4"><input type="hidden" name="ticketId" value={ticket.id} /><input type="hidden" name="clientRequestId" value={randomUUID()} /><label className="grid gap-2 text-sm">Yanıtınız<textarea name="body" required minLength={2} maxLength={5000} rows={5} className="rounded-md border bg-background p-2" /></label><button className="mt-3 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Yanıt gönder</button></form>}
  </div>
}
