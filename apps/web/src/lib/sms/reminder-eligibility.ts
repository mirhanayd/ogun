// GitHub issue #41 / Prompt 7.3, GÖREV 3 — "Randevudan 24 saat önce otomatik
// SMS [...] Danışanın SMS rızası yoksa gönderme". scheduling.ts (GitHub #39)
// ile AYNI gerekçe: bu SAF fonksiyonlar DB/zamanlayıcıdan AYRI tutuluyor ki
// hem "24 saat önce" penceresi hem de "rıza yoksa asla gönderme" kuralı,
// gerçek bir veritabanı veya cron olmadan, düz girdi/çıktı olarak test
// edilebilsin (bkz. reminder-eligibility.test.ts).
//
// NOT (otomatik tetikleme — cron/worker): bu repoda (docker-compose.yml'de
// sadece Postgres/MinIO var) periyodik bir zamanlayıcı altyapısı HENÜZ
// KURULU DEĞİL — tıpkı queries/clients.ts findClientsPastDeletionGracePeriod'un
// ("Bunu sıfırdan kurmak bu issue'nun kapsamı DIŞINDA bırakıldı") ve
// schema/billing.ts clientPackageStatusEnum'un ("otomatik bir cron YOK")
// AYNI şekilde bıraktığı gibi. Bu dosya + queries/sms.ts + reminder-runner.ts
// (apps/web/src/lib/sms/reminder-runner.ts) "hangi randevuların hatırlatmaya
// İHTİYACI VAR" sorusunu tamamen çözer; bunu periyodik (ör. her 15 dakikada
// bir) tetikleyecek gerçek bir cron/worker (Vercel Cron, node-cron, pg-boss)
// kurmak ayrı bir altyapı issue'sunun kapsamı — production'da bu runner'ı
// çağıracak bir zamanlayıcı EKLENMEDEN GÖREV 3 GERÇEK ANLAMDA "otomatik"
// olmaz, PR açıklamasında bu AÇIKÇA not düşülüyor.

export interface AppointmentReminderCandidate {
  appointmentId: string
  startsAt: Date
  // İptal/gelmiş/gelmemiş randevular için hatırlatma ANLAMSIZ — sadece
  // 'planlandı' | 'ertelendi' (henüz gerçekleşecek) durumlar aday sayılır
  // (bkz. scheduling.ts AppointmentInterval status alanındaki AYNI ayrım).
  status: 'planlandı' | 'geldi' | 'gelmedi' | 'iptal' | 'ertelendi'
}

export interface ClientConsentInfo {
  smsConsentAt: Date | null
  phone: string | null
}

// "24 saat önce" penceresi — tam olarak 24:00:00 değil, bir ARALIK: runner
// periyodik çalıştığı için (ör. her 15 dakikada bir), tam saatinde
// yakalayamama riskini önlemek adına [24s, 24s - PENCERE_DAKIKA] aralığında
// "şimdi gönderilmeli" sayılır. 30 dakikalık pencere, en agresif çalıştırma
// aralığını (15 dk) rahatça kapsar, aynı randevu iki farklı çalıştırmada
// İKİ KEZ eşleşse bile dedupe (bkz. reminder-runner.ts, sms_logs üzerinden)
// ikinci gönderimi engeller.
const REMINDER_WINDOW_HOURS = 24
const REMINDER_WINDOW_MINUTES = 30

export function isWithinReminderWindow(startsAt: Date, now: Date = new Date()): boolean {
  const hoursUntil = (startsAt.getTime() - now.getTime()) / (1000 * 60 * 60)
  return hoursUntil <= REMINDER_WINDOW_HOURS && hoursUntil > REMINDER_WINDOW_HOURS - REMINDER_WINDOW_MINUTES / 60
}

// SMS rızası yoksa (smsConsentAt NULL) VEYA telefon numarası yoksa hatırlatma
// ASLA gönderilmez — roadmap'in bire bir talimatı. Bu fonksiyon, ÇAĞIRAN
// TARAFIN (reminder-runner.ts) provider.send()'i hiç ÇAĞIRMADAN önce
// kontrol etmesi GEREKEN TEK kapı — provider'ın kendisi rıza kavramından
// habersizdir (bkz. lib/sms/types.ts SmsSender, sadece "to"/"message" alır).
export function hasSmsConsent(client: ClientConsentInfo): boolean {
  return client.smsConsentAt !== null && !!client.phone
}

export function isReminderEligibleAppointment(appointment: Pick<AppointmentReminderCandidate, 'status'>): boolean {
  return appointment.status === 'planlandı' || appointment.status === 'ertelendi'
}

export interface ReminderDecision {
  shouldSend: boolean
  // Gönderilmeyecekse NEDEN — sms_logs'a 'rıza_yok' olarak yazılabilsin diye
  // (bkz. schema/sms.ts smsLogStatusEnum notu, "diyetisyen neden gitmedi
  // sorusuna bir yanıt bulabilsin").
  reason: 'ok' | 'rıza_yok' | 'zaman_penceresi_dışı' | 'uygun_durum_değil' | 'zaten_gönderildi' | null
}

// TEK giriş noktası — reminder-runner.ts BAŞKA hiçbir yerde bu kararı
// TEKRAR üretmemeli, hep bu fonksiyonu çağırmalı.
export function decideReminderForAppointment(
  appointment: AppointmentReminderCandidate,
  client: ClientConsentInfo,
  alreadySent: boolean,
  now: Date = new Date(),
): ReminderDecision {
  if (!isReminderEligibleAppointment(appointment)) {
    return { shouldSend: false, reason: 'uygun_durum_değil' }
  }
  if (alreadySent) {
    return { shouldSend: false, reason: 'zaten_gönderildi' }
  }
  if (!isWithinReminderWindow(appointment.startsAt, now)) {
    return { shouldSend: false, reason: 'zaman_penceresi_dışı' }
  }
  if (!hasSmsConsent(client)) {
    return { shouldSend: false, reason: 'rıza_yok' }
  }
  return { shouldSend: true, reason: 'ok' }
}
