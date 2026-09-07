export type SyncPhase = 'auth' | 'workspace_pull' | 'outbox_push' | 'reconciliation_pull' | 'food_catalog_version' | 'food_catalog_download' | 'clinical_catalog_version' | 'clinical_catalog_download'
export interface SyncDiagnostic { phase: SyncPhase; httpStatus: number | null; errorType: string; message: string; occurredAt: string; nextRetryAt: string | null }

const PHASE_MESSAGES: Record<SyncPhase, string> = {
  auth: 'Oturum yenilenmeli.', workspace_pull: 'Çalışma alanı alınamadı.', outbox_push: 'Yerel değişiklikler gönderilemedi.', reconciliation_pull: 'Gönderilen değişiklikler doğrulanamadı.',
  food_catalog_version: 'Besin katalog sürümü alınamadı.', food_catalog_download: 'Besin kataloğu indirilemedi.',
  clinical_catalog_version: 'Klinik katalog sürümü alınamadı.', clinical_catalog_download: 'Klinik katalog indirilemedi.',
}

// Only allowlisted metadata crosses into status UI or persisted outbox errors.
// Response bodies, exception messages, URLs, tokens and clinical payloads never do.
export class SyncPhaseError extends Error {
  constructor(public phase: SyncPhase, public httpStatus: number | null = null, public errorType = 'network') {
    super(PHASE_MESSAGES[phase])
  }
  get retryable() { return this.httpStatus === null || this.httpStatus === 408 || this.httpStatus === 429 || (this.httpStatus ?? 0) >= 500 }
  diagnostic(nextRetryAt: string | null = null): SyncDiagnostic {
    return { phase: this.phase, httpStatus: this.httpStatus, errorType: this.errorType, message: this.message, occurredAt: new Date().toISOString(), nextRetryAt }
  }
}

export async function syncPhase<T>(phase: SyncPhase, run: () => Promise<T>): Promise<T> {
  try { return await run() } catch (error) {
    if (error instanceof SyncPhaseError) throw error
    throw new SyncPhaseError(phase, null, error instanceof TypeError ? 'network' : 'operation')
  }
}

export async function syncFetchJson<T>(phase: SyncPhase, url: string, init: RequestInit = {}): Promise<T> {
  return syncPhase(phase, async () => {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new SyncPhaseError(response.status === 401 ? 'auth' : phase, response.status, 'http')
    try { return await response.json() as T } catch { throw new SyncPhaseError(phase, response.status, 'invalid_response') }
  })
}
