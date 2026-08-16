import { describe, expect, it, vi } from 'vitest'
import { withAudit, type AuditRecorder } from './audit'
import type { ClinicContext, ClinicScope } from './authz'

// 'server-only', Next.js'in bundler'ına (webpack/Turbopack) özel bir
// mekanizmayla çalışır: içe aktarıldığında düz Node/Vite altında HER ZAMAN
// fırlatır, sadece Next'in kendi derleme hattında zararsızdır. audit.ts bunu
// dosya başında import ediyor (bkz. authz.ts'teki aynı desen) — testte gerçek
// paketin yerine boş bir modül koyuyoruz ki withAudit'in mantığını Next
// çalışma zamanı olmadan izole test edebilelim. vi.mock çağrıları Vitest
// tarafından dosyanın en üstüne otomatik taşındığı (hoisting) için import'tan
// SONRA yazılmış olması sorun değil.
vi.mock('server-only', () => ({}))

// ClinicScope, authz.ts dışından üretilemeyen (dışa aktarılmamış bir sembolle
// markalanmış) bir tip — bkz. authz.ts'teki tasarım notu. Test fixture'ı
// olarak burada BİLEREK bir tip iddiası (assertion) ile bypass ediliyor;
// gerçek kodda bu yol YOKTUR, sadece requireClinic()/requireRole() üzerinden
// üretilir.
function fakeCtx(overrides: Partial<ClinicContext> = {}): ClinicContext {
  return {
    user: { id: 'user_1', email: 'dyt@example.com', name: 'Test Diyetisyen' },
    sessionId: 'session_1',
    scope: { clinicId: 'clinic_1' } as unknown as ClinicScope,
    role: 'owner',
    ...overrides,
  }
}

describe('withAudit', () => {
  it('başarılı bir işlemde denetim kaydını doğru alanlarla yazar ve sonucu değiştirmeden döner', async () => {
    const recorder = vi.fn<AuditRecorder>().mockResolvedValue(undefined)
    const ctx = fakeCtx()

    const readClient = withAudit(
      {
        action: 'read',
        entityType: 'client',
        entityId: ([clientId]: [string]) => clientId,
      },
      async (_ctx, clientId: string) => ({ id: clientId, name: 'Ayşe Yılmaz' }),
      recorder,
    )

    const result = await readClient(ctx, 'client_42')

    expect(result).toEqual({ id: 'client_42', name: 'Ayşe Yılmaz' })
    expect(recorder).toHaveBeenCalledTimes(1)
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: 'clinic_1',
        userId: 'user_1',
        action: 'read',
        entityType: 'client',
        entityId: 'client_42',
      }),
    )
  })

  it('entityId sonuçtan türetilebilir (ör. yeni oluşturulan kaydın id\'si)', async () => {
    const recorder = vi.fn<AuditRecorder>().mockResolvedValue(undefined)
    const ctx = fakeCtx()

    const createClient = withAudit(
      {
        action: 'create',
        entityType: 'client',
        entityId: (_args, result: { id: string } | undefined) => result?.id ?? null,
      },
      async () => ({ id: 'client_new_1' }),
      recorder,
    )

    await createClient(ctx)

    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', entityId: 'client_new_1' }))
  })

  it('metadata fonksiyonu argüman ve sonuca göre ek bağlam üretir', async () => {
    const recorder = vi.fn<AuditRecorder>().mockResolvedValue(undefined)
    const ctx = fakeCtx()

    const exportClient = withAudit(
      {
        action: 'export',
        entityType: 'client',
        entityId: ([clientId]: [string]) => clientId,
        metadata: (_args, result: { fields: number } | undefined) => ({ fieldCount: result?.fields }),
      },
      async () => ({ fields: 12 }),
      recorder,
    )

    await exportClient(ctx, 'client_7')

    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({ metadata: { fieldCount: 12 } }))
  })

  it('asıl işlem hata fırlattığında bile denetim kaydı yazılır ve orijinal hata yeniden fırlatılır', async () => {
    const recorder = vi.fn<AuditRecorder>().mockResolvedValue(undefined)
    const ctx = fakeCtx()

    const failingAction = withAudit(
      { action: 'delete', entityType: 'client', entityId: ([clientId]: [string]) => clientId },
      async () => {
        throw new Error('Danışan bulunamadı.')
      },
      recorder,
    )

    await expect(failingAction(ctx, 'client_missing')).rejects.toThrow('Danışan bulunamadı.')
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delete',
        entityId: 'client_missing',
        metadata: expect.objectContaining({ error: 'Danışan bulunamadı.' }),
      }),
    )
  })

  it('denetim kaydı yazımı başarısız olsa bile asıl işlemin sonucu kaybolmaz', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const recorder = vi.fn<AuditRecorder>().mockRejectedValue(new Error('DB bağlantısı yok'))
    const ctx = fakeCtx()

    const readClient = withAudit(
      { action: 'read', entityType: 'client' },
      async () => ({ ok: true }),
      recorder,
    )

    const result = await readClient(ctx)

    expect(result).toEqual({ ok: true })
    expect(consoleErrorSpy).toHaveBeenCalledOnce()
    consoleErrorSpy.mockRestore()
  })
})
