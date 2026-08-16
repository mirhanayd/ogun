// GitHub issue #39 / Prompt 7.1, GÖREV 2 — bir gün sütunundaki randevu
// bloklarının üst üste binmeden yan yana (lane/kulvar) yerleşimi. Farklı
// diyetisyenlerin aynı zaman diliminde randevusu olabilir (aynı diyetisyenin
// olamaz — bkz. scheduling.ts findConflictingAppointment), bu yüzden
// calendar-grid.tsx bu durumu görsel olarak ayırt edebilmeli.
export interface LayoutInput {
  id: string
  startsAt: Date
  endsAt: Date
}

export interface LaneAssignment {
  id: string
  lane: number
  laneCount: number
}

// Basit "greedy interval graph coloring": aralığı en erken biten, hâlâ
// müsait bir kulvara ata; yoksa yeni kulvar aç. laneCount, GİRDİDEKİ (aynı
// örtüşme kümesindeki) randevu sayısına göre her randevu için AYRI
// hesaplanır — bir günün farklı saatlerindeki randevular birbirinin
// genişliğini etkilemez.
export function assignLanes(appointments: readonly LayoutInput[]): LaneAssignment[] {
  const sorted = [...appointments].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  const laneEndTimes: number[] = []
  const laneOf = new Map<string, number>()

  for (const appointment of sorted) {
    let lane = laneEndTimes.findIndex((endTime) => endTime <= appointment.startsAt.getTime())
    if (lane === -1) {
      lane = laneEndTimes.length
      laneEndTimes.push(appointment.endsAt.getTime())
    } else {
      laneEndTimes[lane] = appointment.endsAt.getTime()
    }
    laneOf.set(appointment.id, lane)
  }

  // Örtüşen kümeler İÇİNDE laneCount'u hesapla: her randevu için, onunla
  // zaman olarak çakışan tüm randevuların kullandığı MAKSİMUM lane+1.
  return sorted.map((appointment) => {
    const overlapping = sorted.filter(
      (other) =>
        other.startsAt.getTime() < appointment.endsAt.getTime() &&
        appointment.startsAt.getTime() < other.endsAt.getTime(),
    )
    const laneCount = Math.max(...overlapping.map((other) => (laneOf.get(other.id) ?? 0) + 1))
    return { id: appointment.id, lane: laneOf.get(appointment.id) ?? 0, laneCount }
  })
}
