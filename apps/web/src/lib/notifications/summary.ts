// GitHub issue #41 / Prompt 7.3, GÖREV 4 — "Bugünün randevuları, gelmeyen
// danışanlar, 2 haftadır ölçüm girmemiş danışanlar, süresi dolan paketler".
// finance-aggregation.ts (GitHub #40) ile AYNI iş bölümü: queries/
// notifications.ts SADECE ham satırları getirir, hangi eşiğin "bildirim
// gerektirir" sayıldığına dair karar BURADA — DB'siz test edilebilir (bkz.
// summary.test.ts).

export const STALE_MEASUREMENT_DAYS = 14
export const PACKAGE_EXPIRY_WARNING_DAYS = 7
export const UPCOMING_APPOINTMENT_DAYS = 7
export const UPCOMING_APPOINTMENT_LIMIT = 6
// no-show taraması ne kadar geriye baksın — "bugün" bağlamında anlamlı kalması
// için son 7 gün (roadmap bir sayı vermedi, "basit tut" kuralıyla tutarlı
// küçük bir varsayılan; daha eskisi zaten randevu geçmişi sekmesinde görünür).
export const NO_SHOW_LOOKBACK_DAYS = 7

export interface UpcomingAppointmentInput {
  startsAt: Date
  status: string
}

export function selectUpcomingAppointments<T extends UpcomingAppointmentInput>(
  appointments: readonly T[],
  now: Date = new Date(),
  limit: number = UPCOMING_APPOINTMENT_LIMIT,
): T[] {
  return appointments
    .filter(
      (appointment) =>
        appointment.startsAt.getTime() >= now.getTime() &&
        (appointment.status === 'planlandı' || appointment.status === 'ertelendi'),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, Math.max(0, limit))
}

export interface ClientMeasurementRecencyInput {
  clientId: string
  firstName: string
  lastName: string
  createdAt: Date
  lastMeasuredAt: Date | null
}

// "2 haftadır ölçüm girmemiş" — YA en son ölçümü 14+ gün önceyse YA DA HİÇ
// ölçümü yoksa VE danışan 14+ gündür kayıtlıysa (bkz. queries/notifications.ts
// dosya başı notu: yeni kayıt olmuş bir danışanı, henüz ilk randevusu bile
// olmadan "ölçüm girilmedi" diye uyarmak yanlış pozitif üretir).
export function isStaleMeasurementClient(
  client: ClientMeasurementRecencyInput,
  now: Date = new Date(),
): boolean {
  const cutoff = new Date(now.getTime() - STALE_MEASUREMENT_DAYS * 24 * 60 * 60 * 1000)
  const referenceDate = client.lastMeasuredAt ?? client.createdAt
  return referenceDate.getTime() < cutoff.getTime()
}

export interface ExpiringPackageInput {
  clientPackageId: string
  clientId: string
  clientFirstName: string
  clientLastName: string
  packageName: string
  expiresAt: Date
}

export function isPackageExpiringSoon(expiresAt: Date, now: Date = new Date()): boolean {
  const warningCutoff = new Date(now.getTime() + PACKAGE_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000)
  return expiresAt.getTime() <= warningCutoff.getTime()
}

// Zaten geçmiş (expiresAt < now) mi, yoksa yaklaşan (now <= expiresAt <=
// +7 gün) mi — panel kartında iki ayrı rozet ("süresi doldu" / "yakında
// dolacak") gösterebilmek için.
export function packageExpiryState(
  expiresAt: Date,
  now: Date = new Date(),
): 'süresi_doldu' | 'yaklaşıyor' {
  return expiresAt.getTime() < now.getTime() ? 'süresi_doldu' : 'yaklaşıyor'
}

export interface NotificationSummaryCounts {
  todayAppointmentsCount: number
  noShowCount: number
  staleMeasurementCount: number
  expiringPackageCount: number
}

export interface NotificationFeedInput {
  todayAppointmentsCount: number
  noShowClients: {
    clientId: string
    clientFirstName: string
    clientLastName: string
    startsAt: Date
  }[]
  clientsWithLastMeasurement: ClientMeasurementRecencyInput[]
  expiringPackages: ExpiringPackageInput[]
}

export interface NotificationFeed extends NotificationSummaryCounts {
  staleMeasurementClients: ClientMeasurementRecencyInput[]
  expiringPackages: (ExpiringPackageInput & { state: 'süresi_doldu' | 'yaklaşıyor' })[]
}

// Panel sayfasının TEK çağıracağı birleştirme noktası — ham veriyi (queries/
// notifications.ts) alıp özet kartların ihtiyaç duyduğu şekle sokar.
export function buildNotificationFeed(
  input: NotificationFeedInput,
  now: Date = new Date(),
): NotificationFeed {
  const staleMeasurementClients = input.clientsWithLastMeasurement.filter((c) =>
    isStaleMeasurementClient(c, now),
  )
  const expiringPackages = input.expiringPackages
    .filter((p) => isPackageExpiringSoon(p.expiresAt, now))
    .map((p) => ({ ...p, state: packageExpiryState(p.expiresAt, now) }))

  return {
    todayAppointmentsCount: input.todayAppointmentsCount,
    noShowCount: input.noShowClients.length,
    staleMeasurementCount: staleMeasurementClients.length,
    expiringPackageCount: expiringPackages.length,
    staleMeasurementClients,
    expiringPackages,
  }
}
