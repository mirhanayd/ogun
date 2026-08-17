// GitHub issue #47 / Prompt 8.3, GÖREV 2 — "Basit kullanım analitiği: hangi
// ekranda ne kadar süre, plan oluşturma süresi. ÖNEMLİ: analitik aracına
// sağlık verisi göndermeyin, sadece olay adları."
//
// Bu dosya İSTEMCİDEN çağrılan TEK giriş noktası (trackEvent) — imzası
// BİLEREK dar: sadece sabit bir eventName (kod içinde tanımlı sabitlerden,
// EVENT NAMES aşağıda) + isteğe bağlı screen/durationMs sayıları kabul eder.
// Serbest bir "metadata" alanı YOK — bir çağıran "kolaylık olsun" diye
// `trackEvent('plan_created', { clientName: '...' })` gibi bir şey YAZAMAZ,
// çünkü TrackEventPayload tipinde öyle bir alan yok. Bu, #45'in Sentry/pino
// PII kırpmasının "runtime'da kırp" yaklaşımından FARKLI, daha güçlü bir
// önlem: burada sağlık verisi hiç OLUŞAMAZ, sonradan KIRPILMASI gerekmez.
export type AnalyticsEventName =
  | 'screen_view'
  | 'plan_created'
  | 'sample_plan_created'
  | 'feedback_submitted'
  | 'product_tour_completed'
  | 'product_tour_skipped'
  | 'client_csv_import_completed'

export interface TrackEventPayload {
  eventName: AnalyticsEventName
  screen?: string
  durationMs?: number
}

// Fire-and-forget: analitik bir isteğin başarısız olması kullanıcının işini
// ASLA engellememeli (bkz. withAudit'teki "denetim kaydı yazılamadıysa asıl
// işlemi engelleme" ilkesiyle AYNI gerekçe, burada daha da düşük riskli bir
// veri için). navigator.sendBeacon TERCİH EDİLİR (sayfa kapanırken/
// navigasyon sırasında bile teslim garantisi daha yüksek — screen_view
// olayları TAM OLARAK bu anda gönderiliyor, bkz. screen-time-tracker.tsx);
// desteklenmeyen ortamlarda (SSR, eski tarayıcı) fetch'e düşer.
export function trackEvent(payload: TrackEventPayload): void {
  if (typeof window === 'undefined') return

  try {
    const body = JSON.stringify(payload)
    if ('sendBeacon' in navigator) {
      const blob = new Blob([body], { type: 'application/json' })
      const delivered = navigator.sendBeacon('/api/analytics/event', blob)
      if (delivered) return
    }
    void fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Sessizce yut — analitik başarısızlığı kullanıcıya asla gösterilmez.
    })
  } catch {
    // JSON.stringify/sendBeacon'un beklenmedik biçimde patlaması durumunda
    // bile analitik, ASLA uygulamanın geri kalanını etkilememeli.
  }
}

// GÖREV 2 — "plan oluşturma süresi". Bir plan oluşturma akışının
// BAŞLANGICINDAN (ör. "Yeni plan" butonuna tıklama) sunucunun yanıt verdiği
// ana kadar geçen süreyi ölçmek için küçük bir yardımcı — süre hesabı HER
// buton bileşeninde tekrar tekrar YAZILMASIN diye.
export function createDurationTracker() {
  const startedAt = performance.now()
  return {
    finish(eventName: AnalyticsEventName, screen?: string) {
      trackEvent({ eventName, screen, durationMs: Math.round(performance.now() - startedAt) })
    },
  }
}
