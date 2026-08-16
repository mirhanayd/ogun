'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, MapPin, NotebookText, Scale, User } from 'lucide-react'
import { toast } from 'sonner'
import { calculateBmi } from '@ogun/nutrition-core'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  APPOINTMENT_STATUS_LABELS_TR,
  APPOINTMENT_TYPE_LABELS_TR,
} from '@/lib/validation/appointment-schemas'
import { fetchAppointmentDetailAction, updateAppointmentStatusAction } from './actions'
import { PostVisitFlow } from './post-visit-flow'

type AppointmentDetail = Awaited<ReturnType<typeof fetchAppointmentDetailAction>>

// GitHub issue #39 / Prompt 7.1, GÖREV 3 — "Randevu detayında: geçmiş ölçüm
// özeti, aktif plan, son notlar — diyetisyen randevuya girmeden 10 saniyede
// hazırlansın." TEK sorgu turuyla (fetchAppointmentDetailAction →
// queries.ts getAppointmentDetail) gelen veriyi TEK ekranda gösterir — ayrı
// sekmelere/sayfalara dağıtılmaz.
export function AppointmentDetailSheet({
  appointmentId,
  open,
  onOpenChange,
  onEdit,
}: {
  appointmentId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<AppointmentDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [busyStatus, setBusyStatus] = useState<string | null>(null)
  const [postVisitOpen, setPostVisitOpen] = useState(false)

  useEffect(() => {
    if (!open || !appointmentId) {
      setDetail(null)
      return
    }
    setLoading(true)
    fetchAppointmentDetailAction(appointmentId)
      .then(setDetail)
      .finally(() => setLoading(false))
  }, [open, appointmentId])

  async function handleStatus(status: 'geldi' | 'gelmedi' | 'iptal') {
    if (!detail?.appointment) return
    setBusyStatus(status)
    const result = await updateAppointmentStatusAction(detail.appointment.id, detail.appointment.clientId, status)
    setBusyStatus(null)
    if (!result.success) {
      toast.error(result.error ?? 'Durum güncellenemedi.')
      return
    }
    toast.success(`Randevu "${APPOINTMENT_STATUS_LABELS_TR[status]}" olarak işaretlendi`)
    if (status === 'geldi') {
      setPostVisitOpen(true)
      return
    }
    router.refresh()
    onOpenChange(false)
  }

  const appointment = detail?.appointment

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Randevu detayı</DialogTitle>
            <DialogDescription>
              Görüşmeye başlamadan önce danışan hakkında hızlı bir özet.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!loading && appointment && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    href={`/danisanlar/${appointment.clientId}`}
                    className="text-base font-semibold hover:underline"
                  >
                    {appointment.clientFirstName} {appointment.clientLastName}
                  </Link>
                  <p className="text-sm text-muted-foreground">{appointment.dietitianName}</p>
                </div>
                <Badge variant={appointment.status === 'iptal' ? 'destructive' : 'secondary'}>
                  {APPOINTMENT_STATUS_LABELS_TR[appointment.status]}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarClock className="size-4" />
                  {appointment.startsAt.toLocaleString('tr-TR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="size-4" />
                  {APPOINTMENT_TYPE_LABELS_TR[appointment.type]}
                </div>
                {appointment.location && (
                  <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                    <MapPin className="size-4" />
                    {appointment.location}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Scale className="size-3.5" />
                  Geçmiş özet
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <SummaryStat
                    label="Son kilo"
                    value={
                      detail.latestMeasurement?.weightKg != null
                        ? `${Number(detail.latestMeasurement.weightKg)} kg`
                        : '—'
                    }
                  />
                  <SummaryStat
                    label="BKİ"
                    value={
                      detail.latestMeasurement?.weightKg != null && detail.latestMeasurement?.heightCm != null
                        ? calculateBmi(
                            Number(detail.latestMeasurement.weightKg),
                            Number(detail.latestMeasurement.heightCm),
                          ).toFixed(1)
                        : '—'
                    }
                  />
                  <SummaryStat
                    label="Aktif plan"
                    value={detail.activePlan?.name ?? 'Yok'}
                  />
                  <SummaryStat label="Geçmiş randevu" value={String(detail.recentAppointmentCount)} />
                </div>
                {detail.activePlan && (
                  <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0 text-xs">
                    <Link href={`/danisanlar/${appointment.clientId}/planlar/${detail.activePlan.id}`}>
                      Planı aç →
                    </Link>
                  </Button>
                )}
              </div>

              {(detail.lastAppointmentNote || appointment.notes) && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <NotebookText className="size-3.5" />
                    Son notlar
                  </p>
                  {appointment.notes && <p>{appointment.notes}</p>}
                  {!appointment.notes && detail.lastAppointmentNote && (
                    <p className="text-muted-foreground">{detail.lastAppointmentNote}</p>
                  )}
                </div>
              )}

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={onEdit}>
                    Düzenle
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyStatus === 'gelmedi'}
                    onClick={() => handleStatus('gelmedi')}
                  >
                    Gelmedi
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyStatus === 'iptal'}
                    onClick={() => handleStatus('iptal')}
                  >
                    İptal et
                  </Button>
                </div>
                <Button size="sm" disabled={busyStatus === 'geldi'} onClick={() => handleStatus('geldi')}>
                  Geldi — görüşmeyi başlat
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {appointment && (
        <PostVisitFlow
          open={postVisitOpen}
          onOpenChange={(next) => {
            setPostVisitOpen(next)
            if (!next) onOpenChange(false)
          }}
          clientId={appointment.clientId}
          clientName={`${appointment.clientFirstName} ${appointment.clientLastName}`}
          dietitianId={appointment.dietitianId}
        />
      )}
    </>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
