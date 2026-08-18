'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { invoke } from '@tauri-apps/api/core'
import { isPermissionGranted, onAction, requestPermission } from '@tauri-apps/plugin-notification'
import { getPanelNotificationFeedAction } from '@/app/(app)/panel/native-notification-actions'
import { isNativeShell } from '@/lib/native-shell'

// GitHub issue #53 / Prompt 9.3, GÖREV 3 — apps/web'in KENDİSİ (panel
// sayfasının kullandığı AYNI özet, bkz. native-notification-actions.ts)
// periyodik olarak okur; DAHA ÖNCE bildirilmemiş bir durum tespit ederse
// `show_native_notification` Tauri komutunu (bkz. apps/desktop/src-tauri/
// src/notifications.rs dosya başı MİMARİ KARAR notu) çağırır. Rust
// KENDİLİĞİNDEN sunucudan veri ÇEKMEZ — sadece "OS'a göster" der; eşik/
// karar mantığı burada, apps/web'de kalır.
//
// "DAHA ÖNCE bildirilmemiş" TESPİTİ — `NotificationFeed` (bkz. summary.ts)
// randevu/gelmeyen-danışan sayıları için STABİL KİMLİKLER TAŞIMAZ (sadece
// toplam sayı) — apps/web'in sorgu katmanına bu issue kapsamında YENİ
// alanlar eklemedik (mimari kural #3: minimal değişiklik). Bu yüzden:
//   - Bugünün randevuları: GÜN BAŞINA bir kez (sayı > 0 ise) bildirilir.
//   - Gelmeyen danışanlar: sayı ÖNCEKİ polldan ARTTIYSA bildirilir.
//   - Ölçüm girilmemiş danışanlar / süresi yaklaşan paketler: BUNLARIN
//     stabil kimlikleri VAR (clientId / clientPackageId) — her biri SADECE
//     BİR KEZ (localStorage'daki "görüldü" kümesine girene kadar) bildirilir.
// Bu "görüldü" durumu SAF bir istemci-taraflı UX detayı — localStorage'da
// tutulur, sunucuya hiç YAZILMAZ.
//
// BİLDİRİME TIKLAMA — bkz. notifications.rs dosya başı notu: tıklama olayı
// Rust'tan bir `ogun://` deep link olarak DEĞİL, doğrudan bu eklentinin
// `onAction` JS API'sinden gelir (pencere zaten çalışıyor, React zaten
// mount — tam bir URL round-trip'i gereksiz dolaylılık olurdu).
const POLL_INTERVAL_MS = 5 * 60 * 1000
const SEEN_STALE_MEASUREMENT_KEY = 'ogun:notified-stale-measurement-clients'
const SEEN_EXPIRING_PACKAGE_KEY = 'ogun:notified-expiring-packages'
const TODAY_APPOINTMENTS_NOTIFIED_DATE_KEY = 'ogun:notified-today-appointments-date'
const LAST_NO_SHOW_COUNT_KEY = 'ogun:last-no-show-count'
// localStorage sınırsız büyümesin diye (bkz. writeSeenIds) en fazla bu
// kadar "görüldü" kimliği tutulur.
const MAX_SEEN_IDS = 500

function readSeenIds(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((value): value is string => typeof value === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeSeenIds(key: string, ids: Set<string>) {
  const asArray = Array.from(ids)
  // En YENİ MAX_SEEN_IDS girişi tut (Set ekleme sırasını korur, en eskiler
  // baştadır) — sınırsız büyümeyi ÖNLER.
  const trimmed = asArray.length > MAX_SEEN_IDS ? asArray.slice(asArray.length - MAX_SEEN_IDS) : asArray
  try {
    localStorage.setItem(key, JSON.stringify(trimmed))
  } catch {
    // localStorage dolu/devre dışı olabilir — bildirim tekrarlanabilir ama
    // uygulama ÇÖKMEZ, sessizce vazgeç.
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

async function showNativeNotification(title: string, body: string, path: string) {
  try {
    await invoke('show_native_notification', { title, body, path })
  } catch (err) {
    console.warn('[native-notification-bridge] native bildirim gösterilemedi', err)
  }
}

export function NativeNotificationBridge() {
  const router = useRouter()
  const pollingStarted = useRef(false)

  // Bildirim izni (GÖREV 3: "ilk açılışta iste, reddedilirse uygulama içi
  // panelden vazgeçme") + tıklama yönlendirmesi.
  useEffect(() => {
    if (!isNativeShell()) return

    void (async () => {
      // GÖREV 3'ün "reddedilirse panel yine çalışsın" gereksinimi burada
      // FİİLEN sağlanıyor: panel sayfası (apps/web/src/app/(app)/panel/
      // page.tsx) bu izinden TAMAMEN bağımsız, sunucudan doğrudan okuyor —
      // bu bloğun sonucu ne olursa olsun panele hiçbir ETKİSİ yok.
      const granted = await isPermissionGranted()
      if (!granted) {
        await requestPermission()
      }
    })()

    let listener: { unregister: () => Promise<void> } | undefined
    let cancelled = false
    void onAction((notification) => {
      const path = notification.extra?.path
      void invoke('focus_main_window_command')
      if (typeof path === 'string') {
        router.push(path)
      }
    }).then((registered) => {
      if (cancelled) {
        void registered.unregister()
      } else {
        listener = registered
      }
    })

    return () => {
      cancelled = true
      void listener?.unregister()
    }
  }, [router])

  // Periyodik özet okuma + tespit edilen YENİ durumları bildirme.
  useEffect(() => {
    if (!isNativeShell() || pollingStarted.current) return
    pollingStarted.current = true

    let cancelled = false

    async function poll() {
      let feed: Awaited<ReturnType<typeof getPanelNotificationFeedAction>>
      try {
        feed = await getPanelNotificationFeedAction()
      } catch (err) {
        console.warn('[native-notification-bridge] bildirim özeti okunamadı', err)
        return
      }
      if (cancelled) return

      void invoke('update_tray_today_appointments_summary', { count: feed.todayAppointmentsCount }).catch(() => {})

      if (feed.todayAppointmentsCount > 0 && localStorage.getItem(TODAY_APPOINTMENTS_NOTIFIED_DATE_KEY) !== todayIso()) {
        localStorage.setItem(TODAY_APPOINTMENTS_NOTIFIED_DATE_KEY, todayIso())
        void showNativeNotification('Bugünün randevuları', `Bugün ${feed.todayAppointmentsCount} randevunuz var.`, '/randevular')
      }

      const lastNoShowCount = Number(localStorage.getItem(LAST_NO_SHOW_COUNT_KEY) ?? '0')
      if (feed.noShowCount > lastNoShowCount) {
        void showNativeNotification(
          'Gelmeyen danışanlar',
          `Son 7 günde ${feed.noShowCount} danışan randevusuna gelmedi.`,
          '/randevular',
        )
      }
      localStorage.setItem(LAST_NO_SHOW_COUNT_KEY, String(feed.noShowCount))

      const seenStale = readSeenIds(SEEN_STALE_MEASUREMENT_KEY)
      for (const client of feed.staleMeasurementClients) {
        if (seenStale.has(client.clientId)) continue
        seenStale.add(client.clientId)
        void showNativeNotification(
          'Ölçüm girilmemiş danışan',
          `${client.firstName} ${client.lastName} — 2+ haftadır ölçüm girilmedi.`,
          `/danisanlar/${client.clientId}`,
        )
      }
      writeSeenIds(SEEN_STALE_MEASUREMENT_KEY, seenStale)

      const seenPackages = readSeenIds(SEEN_EXPIRING_PACKAGE_KEY)
      for (const pkg of feed.expiringPackages) {
        if (seenPackages.has(pkg.clientPackageId)) continue
        seenPackages.add(pkg.clientPackageId)
        const stateLabel = pkg.state === 'süresi_doldu' ? 'süresi doldu' : 'yakında dolacak'
        void showNativeNotification(
          'Paket süresi',
          `${pkg.clientFirstName} ${pkg.clientLastName} — ${pkg.packageName} ${stateLabel}.`,
          `/danisanlar/${pkg.clientId}`,
        )
      }
      writeSeenIds(SEEN_EXPIRING_PACKAGE_KEY, seenPackages)
    }

    void poll()
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return null
}
