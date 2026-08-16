import { createId } from '@paralleldrive/cuid2'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { derivePlanShareStatus, generateShareToken } from './plan-shares'
import type { Database } from '../client'

// GitHub issue #36 / Prompt 6.2 — SAF (DB gerektirmeyen) birim testleri —
// aşağıdaki DATABASE_URL kapılı describe bloğunun AKSİNE her zaman çalışır.
describe('generateShareToken', () => {
  it('URL-safe, 32 bayt (256 bit) rastgelelik taşıyan bir token üretir', () => {
    const token = generateShareToken()
    expect(token).toHaveLength(43) // base64url, dolgusuz, 32 bayt -> 43 karakter
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('her çağrıda farklı bir token üretir (çakışma pratikte imkansız)', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateShareToken()))
    expect(tokens.size).toBe(100)
  })
})

describe('derivePlanShareStatus', () => {
  it('share yoksa not_shared döner', () => {
    expect(derivePlanShareStatus(null, false)).toBe('not_shared')
  })

  it('share var ama hiç gönderim kaydı yoksa not_shared döner', () => {
    expect(derivePlanShareStatus({ viewedAt: null }, false)).toBe('not_shared')
  })

  it('gönderim kaydı var ama henüz görüntülenmediyse sent döner', () => {
    expect(derivePlanShareStatus({ viewedAt: null }, true)).toBe('sent')
  })

  it('görüntülenmişse (gönderim kaydı olsun olmasın) viewed döner', () => {
    expect(derivePlanShareStatus({ viewedAt: new Date() }, true)).toBe('viewed')
    expect(derivePlanShareStatus({ viewedAt: new Date() }, false)).toBe('viewed')
  })
})

// GitHub issue #36 / Prompt 6.2 — plan_shares/plan_share_sends round-trip
// testleri. plans.test.ts ile AYNI desen (bkz. o dosyanın dosya başı notu):
// DATABASE_URL yoksa bu describe bloğu TAMAMEN atlanır.
const DATABASE_URL = process.env.DATABASE_URL
const describeWithDb = DATABASE_URL ? describe : describe.skip

describeWithDb('plan-shares query layer (round-trip, gerçek DB)', () => {
  let db: Database
  let clinicId: string
  let otherClinicId: string
  let userId: string
  let clientId: string
  let planId: string

  beforeAll(async () => {
    const clientModule = await import('../client')
    db = clientModule.db
    const { clinics, users } = await import('../schema/tenancy')
    const { clients } = await import('../schema/clients')
    const { createPlan } = await import('./plans')

    const suffix = createId()
    userId = createId()
    await db.insert(users).values({ id: userId, email: `test-share-${suffix}@ogun.test`, name: 'Test Diyetisyen' })

    const [clinic] = await db
      .insert(clinics)
      .values({ name: 'Test Kliniği', slug: `test-klinik-share-${suffix}` })
      .returning()
    clinicId = clinic!.id

    const [otherClinic] = await db
      .insert(clinics)
      .values({ name: 'Diğer Klinik', slug: `diger-klinik-share-${suffix}` })
      .returning()
    otherClinicId = otherClinic!.id

    const [client] = await db
      .insert(clients)
      .values({ clinicId, firstName: 'Ayşe', lastName: 'Yılmaz' })
      .returning()
    clientId = client!.id

    const plan = await createPlan(db, clinicId, userId, { clientId, name: 'Paylaşım testi planı' })
    planId = plan.id
  })

  afterAll(async () => {
    const { clinics, users } = await import('../schema/tenancy')
    const { clients } = await import('../schema/clients')
    const { deletePlan } = await import('./plans')
    const { eq } = await import('drizzle-orm')
    await deletePlan(db, clinicId, planId)
    await db.delete(clients).where(eq(clients.id, clientId))
    await db.delete(clinics).where(eq(clinics.id, clinicId))
    await db.delete(clinics).where(eq(clinics.id, otherClinicId))
    await db.delete(users).where(eq(users.id, userId))
    await db.$client.end()
  })

  it('createOrReuseShare: aktif bir link varsa AYNI satırı döner, yoksa yenisini açar', async () => {
    const { createOrReuseShare } = await import('./plan-shares')

    const first = await createOrReuseShare(db, clinicId, planId, userId)
    expect(first.token).toHaveLength(43) // 32 bayt base64url -> 43 karakter (dolgusuz)
    expect(first.revokedAt).toBeNull()

    const second = await createOrReuseShare(db, clinicId, planId, userId)
    expect(second.id).toBe(first.id)
    expect(second.token).toBe(first.token)
  })

  it('revokeShare sonrası createOrReuseShare YENİ bir link açar', async () => {
    const { createOrReuseShare, revokeShare } = await import('./plan-shares')

    const active = await createOrReuseShare(db, clinicId, planId, userId)
    const revoked = await revokeShare(db, clinicId, active.id)
    expect(revoked?.revokedAt).not.toBeNull()

    const fresh = await createOrReuseShare(db, clinicId, planId, userId)
    expect(fresh.id).not.toBe(active.id)
    expect(fresh.token).not.toBe(active.token)
  })

  it('başka bir klinikten linki iptal etmek reddedilir (ClinicScope izolasyonu)', async () => {
    const { createOrReuseShare, revokeShare } = await import('./plan-shares')

    const share = await createOrReuseShare(db, clinicId, planId, userId)
    await expect(revokeShare(db, otherClinicId, share.id)).rejects.toThrow()
  })

  it('getPublicShareByToken: süresi geçmiş bir link expired döner', async () => {
    const { generateShareToken, getPublicShareByToken } = await import('./plan-shares')
    const { planShares } = await import('../schema/plan-shares')

    const token = generateShareToken()
    await db.insert(planShares).values({
      planId,
      token,
      expiresAt: new Date(Date.now() - 60_000), // 1 dakika önce sona erdi
    })

    const result = await getPublicShareByToken(db, token)
    expect(result.status).toBe('expired')
  })

  it('getPublicShareByToken: not_found/active/revoked durumlarını doğru döner', async () => {
    const { createOrReuseShare, revokeShare, getPublicShareByToken } = await import('./plan-shares')

    const notFound = await getPublicShareByToken(db, 'bilinmeyen-token-xyz')
    expect(notFound.status).toBe('not_found')

    const share = await createOrReuseShare(db, clinicId, planId, userId)
    const active = await getPublicShareByToken(db, share.token)
    expect(active.status).toBe('active')
    if (active.status === 'active') {
      expect(active.planId).toBe(planId)
      expect(active.clinicId).toBe(clinicId)
    }

    await revokeShare(db, clinicId, share.id)
    const afterRevoke = await getPublicShareByToken(db, share.token)
    expect(afterRevoke.status).toBe('revoked')
  })

  it('recordPublicShareView: viewedAt SADECE ilk çağrıda set edilir, viewCount her seferinde artar', async () => {
    const { createOrReuseShare, recordPublicShareView, getLatestShareForPlan } = await import('./plan-shares')

    const share = await createOrReuseShare(db, clinicId, planId, userId)
    expect(share.viewedAt).toBeNull()
    expect(share.viewCount).toBe(0)

    await recordPublicShareView(db, share.id)
    const afterFirstView = await getLatestShareForPlan(db, clinicId, planId)
    expect(afterFirstView?.viewedAt).not.toBeNull()
    expect(afterFirstView?.viewCount).toBe(1)

    const firstViewedAt = afterFirstView!.viewedAt!.getTime()
    await recordPublicShareView(db, share.id)
    const afterSecondView = await getLatestShareForPlan(db, clinicId, planId)
    expect(afterSecondView?.viewCount).toBe(2)
    expect(afterSecondView?.viewedAt?.getTime()).toBe(firstViewedAt)
  })

  it('recordShareSend + getShareStatusesForPlans: gönderim/görüntüleme durumu doğru türetilir', async () => {
    const { createOrReuseShare, recordShareSend, recordPublicShareView, getShareStatusesForPlans } = await import(
      './plan-shares'
    )
    const { createPlan, deletePlan } = await import('./plans')

    // Bu planın kendi share'i olmayan, HİÇ paylaşılmamış bir plan (not_shared).
    const unsharedPlan = await createPlan(db, clinicId, userId, { clientId, name: 'Paylaşılmamış plan' })

    // Gönderilmiş ama görüntülenmemiş bir plan (sent).
    const sentPlan = await createPlan(db, clinicId, userId, { clientId, name: 'Gönderilmiş plan' })
    const sentShare = await createOrReuseShare(db, clinicId, sentPlan.id, userId)
    await recordShareSend(db, clinicId, sentShare.id, { channel: 'whatsapp', recipient: '05551234567', sentBy: userId })

    // Görüntülenmiş bir plan (viewed).
    const viewedPlan = await createPlan(db, clinicId, userId, { clientId, name: 'Görüntülenmiş plan' })
    const viewedShare = await createOrReuseShare(db, clinicId, viewedPlan.id, userId)
    await recordShareSend(db, clinicId, viewedShare.id, { channel: 'email', recipient: 'test@ornek.com', sentBy: userId })
    await recordPublicShareView(db, viewedShare.id)

    const statuses = await getShareStatusesForPlans(db, clinicId, [unsharedPlan.id, sentPlan.id, viewedPlan.id])
    expect(statuses.get(unsharedPlan.id) ?? 'not_shared').toBe('not_shared')
    expect(statuses.get(sentPlan.id)).toBe('sent')
    expect(statuses.get(viewedPlan.id)).toBe('viewed')

    await deletePlan(db, clinicId, unsharedPlan.id)
    await deletePlan(db, clinicId, sentPlan.id)
    await deletePlan(db, clinicId, viewedPlan.id)
  })
})
