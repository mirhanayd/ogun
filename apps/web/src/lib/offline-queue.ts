// GitHub issue #25 / Prompt 5.3 — GÖREV 4: "Zustand'da taslak durumu, 800ms
// debounce ile server action'a yaz... Çevrimdışıyken düzenlemeye izin ver,
// bağlantı gelince senkronize et". Roadmap'in kendi notu bu mekanizmanın
// KAPSAMINI netleştiriyor: "kusursuz bir senkron motoru olmak zorunda değil,
// makul bir best-effort sürüm yeterli — kuyruğa al, online event'inde tekrar
// dene". Bu dosya TAM OLARAK o kapsamda, framework'ten bağımsız (React/
// Zustand'a bağımlı DEĞİL) saf bir sınıf — plan-editor-store.ts bunu
// sarmalar, bu ayrım birim testte (offline-queue.test.ts) DOM/React
// olmadan test edilebilmesi içindir.
export type QueueStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

export interface QueuedMutation {
  key: string
  run: () => Promise<void>
}

export interface OfflineQueueOptions {
  debounceMs?: number
  isOnline?: () => boolean
  onStatusChange?: (status: QueueStatus, pendingCount: number) => void
}

export class OfflineQueue {
  private readonly debounceMs: number
  private readonly isOnline: () => boolean
  private readonly onStatusChange?: (status: QueueStatus, pendingCount: number) => void
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pending = new Map<string, () => Promise<void>>()
  private flushing = false

  constructor(options: OfflineQueueOptions = {}) {
    this.debounceMs = options.debounceMs ?? 800
    this.isOnline =
      options.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine))
    this.onStatusChange = options.onStatusChange
  }

  get pendingCount(): number {
    return this.pending.size
  }

  // Aynı `key` ile art arda enqueue çağrıları COALESCE olur — bir metin
  // alanına yazarken her tuş vuruşu ayrı bir istek AÇMAZ, sadece SONUNCUSU
  // 800ms sessizlikten sonra sunucuya gider. `immediate: true` (ör. bir
  // kalem ekleme/silme) debounce'u atlar, hemen (veya çevrimdışıysa kuyruğa
  // alınmış olarak) çalıştırmayı dener.
  enqueue(mutation: QueuedMutation, options: { immediate?: boolean } = {}): void {
    const existingTimer = this.timers.get(mutation.key)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.timers.delete(mutation.key)
    }
    this.pending.set(mutation.key, mutation.run)

    if (options.immediate) {
      void this.runOne(mutation.key)
      return
    }

    const timer = setTimeout(() => {
      this.timers.delete(mutation.key)
      void this.runOne(mutation.key)
    }, this.debounceMs)
    this.timers.set(mutation.key, timer)

    if (!this.isOnline()) {
      this.onStatusChange?.('offline', this.pendingCount)
    }
  }

  private async runOne(key: string): Promise<void> {
    if (!this.isOnline()) {
      // Bağlantı yok — mutasyon `pending`de KALIR (silinmiyor), bir sonraki
      // notifyOnline() bunu tekrar dener. Kullanıcı bu sırada düzenlemeye
      // devam edebilir (yerel taslak zaten güncel).
      this.onStatusChange?.('offline', this.pendingCount)
      return
    }
    const run = this.pending.get(key)
    if (!run) return

    this.onStatusChange?.('saving', this.pendingCount)
    try {
      await run()
      this.pending.delete(key)
      this.onStatusChange?.(this.pendingCount === 0 ? 'saved' : 'saving', this.pendingCount)
    } catch (error) {
      // Mutasyon KUYRUKTA KALIR (silinmiyor) — geçici bir ağ hatası ya da
      // sunucu hatası olabilir, bir sonraki notifyOnline()'da veya elle
      // retryNow()'da tekrar denenir. Sessizce yutulmuyor, konsola düşüyor.
      console.error(`[offline-queue] mutasyon başarısız (key=${key}):`, error)
      this.onStatusChange?.('error', this.pendingCount)
    }
  }

  // Bağlantı geri geldiğinde (window 'online' event, bkz. plan-editor.tsx)
  // kuyruktaki HER ŞEYİ sırayla flush eder. Bekleyen debounce zamanlayıcıları
  // varsa iptal edilip hemen çalıştırılır.
  async notifyOnline(): Promise<void> {
    if (this.flushing) return
    this.flushing = true
    try {
      const keys = [...this.pending.keys()]
      for (const key of keys) {
        const timer = this.timers.get(key)
        if (timer) {
          clearTimeout(timer)
          this.timers.delete(key)
        }
        await this.runOne(key)
      }
    } finally {
      this.flushing = false
    }
  }

  // Aynı notifyOnline mantığını elle (ör. "tekrar dene" düğmesi) tetiklemek
  // için — şu an UI'da kullanılmıyor ama offline kuyruğun genel bir "retry"
  // arayüzü olması test edilebilirlik açısından faydalı.
  async retryNow(): Promise<void> {
    await this.notifyOnline()
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
