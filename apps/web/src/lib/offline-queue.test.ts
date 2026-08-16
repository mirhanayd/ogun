import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { OfflineQueue } from './offline-queue'

// GitHub issue #25 / Prompt 5.3 — GÖREV 4: offline kuyruk/retry mantığının
// birim testleri. Gerçek zamanlayıcılar yerine vi.useFakeTimers() kullanılır
// — 800ms'lik debounce'u gerçekten beklemeden test etmek için.
describe('OfflineQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aynı key ile art arda enqueue çağrılarını coalesce eder (sadece sonuncusu çalışır)', async () => {
    const runs: string[] = []
    const queue = new OfflineQueue({ debounceMs: 800, isOnline: () => true })

    queue.enqueue({
      key: 'field',
      run: async () => {
        runs.push('1')
      },
    })
    queue.enqueue({
      key: 'field',
      run: async () => {
        runs.push('2')
      },
    })
    queue.enqueue({
      key: 'field',
      run: async () => {
        runs.push('3')
      },
    })

    await vi.advanceTimersByTimeAsync(800)

    expect(runs).toEqual(['3'])
  })

  it('farklı key ile enqueue edilen mutasyonlar birbirini iptal etmez', async () => {
    const runs: string[] = []
    const queue = new OfflineQueue({ debounceMs: 800, isOnline: () => true })

    queue.enqueue({
      key: 'a',
      run: async () => {
        runs.push('a')
      },
    })
    queue.enqueue({
      key: 'b',
      run: async () => {
        runs.push('b')
      },
    })

    await vi.advanceTimersByTimeAsync(800)

    expect(runs.sort()).toEqual(['a', 'b'])
  })

  it('immediate:true debounce beklemeden hemen çalışır', async () => {
    const runs: string[] = []
    const queue = new OfflineQueue({ debounceMs: 800, isOnline: () => true })

    queue.enqueue(
      {
        key: 'x',
        run: async () => {
          runs.push('x')
        },
      },
      { immediate: true },
    )
    await vi.advanceTimersByTimeAsync(0)

    expect(runs).toEqual(['x'])
  })

  it('çevrimdışıyken mutasyon çalıştırılmaz, status "offline" bildirilir', async () => {
    const statuses: string[] = []
    const queue = new OfflineQueue({
      debounceMs: 800,
      isOnline: () => false,
      onStatusChange: (status) => statuses.push(status),
    })

    let ran = false
    queue.enqueue({
      key: 'x',
      run: async () => {
        ran = true
      },
    })
    await vi.advanceTimersByTimeAsync(800)

    expect(ran).toBe(false)
    expect(queue.pendingCount).toBe(1)
    expect(statuses).toContain('offline')
  })

  it('notifyOnline() bağlantı geri geldiğinde kuyruktaki her şeyi flush eder', async () => {
    let online = false
    const queue = new OfflineQueue({ debounceMs: 800, isOnline: () => online })

    let ran = false
    queue.enqueue({
      key: 'x',
      run: async () => {
        ran = true
      },
    })
    await vi.advanceTimersByTimeAsync(800)
    expect(ran).toBe(false)

    online = true
    await queue.notifyOnline()

    expect(ran).toBe(true)
    expect(queue.pendingCount).toBe(0)
  })

  it('başarısız bir mutasyon kuyrukta kalır, bir sonraki notifyOnline() tekrar dener', async () => {
    const queue = new OfflineQueue({ debounceMs: 800, isOnline: () => true })
    // console.error gürültüsünü testte bastır (offline-queue kasıtlı olarak loglar)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    let attempts = 0
    queue.enqueue(
      {
        key: 'flaky',
        run: async () => {
          attempts += 1
          if (attempts < 2) throw new Error('geçici ağ hatası')
        },
      },
      { immediate: true },
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)
    expect(queue.pendingCount).toBe(1) // hâlâ kuyrukta

    await queue.notifyOnline()
    expect(attempts).toBe(2)
    expect(queue.pendingCount).toBe(0) // ikinci denemede başarılı, kuyruktan düştü

    errorSpy.mockRestore()
  })
})
