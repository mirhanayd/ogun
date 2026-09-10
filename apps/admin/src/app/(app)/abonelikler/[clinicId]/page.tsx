import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getSubscriptionForPlatform } from '@ogun/db/queries'
import {
  PLAN_DEFINITIONS,
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  getPlanPriceLabel,
} from '@ogun/subscription-core'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { roleHasPermission } from '@/lib/platform-permissions'
import {
  activateSubscriptionAction,
  changeBillingCycleAction,
  changePlanAction,
  correctStatusAction,
  extendTrialAction,
  setCancellationAction,
} from '../actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const date = (value: Date | null) => value?.toLocaleString('tr-TR') ?? '—'
const payloadLine = (event: { eventType: string; payload: unknown }) => {
  const p =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {}
  if (event.eventType === 'plan_changed') return `${p.fromPlan ?? '—'} → ${p.toPlan ?? '—'}`
  if (event.eventType === 'billing_cycle_changed')
    return `${p.fromBillingCycle ?? '—'} → ${p.toBillingCycle ?? '—'}`
  if (event.eventType === 'status_corrected') return `${p.fromStatus ?? '—'} → ${p.toStatus ?? '—'}`
  if (event.eventType === 'trial_extended')
    return `+${p.days ?? '—'} gün · ${p.newTrialEndsAt ?? ''}`
  if (event.eventType === 'cancel_requested') return 'Dönem sonunda'
  if (event.eventType === 'cancel_request_reverted') return 'İptal talebi kaldırıldı'
  return 'Abonelik olayı'
}

export default async function SubscriptionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clinicId: string }>
  searchParams: Promise<{ mesaj?: string; hata?: string }>
}) {
  const ctx = await requirePlatformPermission('subscriptions.read')
  const { clinicId } = await params
  const query = await searchParams
  const item = await getSubscriptionForPlatform(db, clinicId)
  if (!item) notFound()
  const canManage = roleHasPermission(ctx.staff.role, 'subscriptions.manage')
  const manual = item.provider === 'manuel'
  const hidden = <input type="hidden" name="clinicId" value={clinicId} />
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/abonelikler">Abonelikler</Link> / {item.clinicName}
      </div>
      <div className="page-head">
        <div>
          <h1>{item.clinicName}</h1>
          <p className="muted">
            Ogun SaaS aboneliği · klinik danışan tahsilatları bu ekranın dışındadır
          </p>
        </div>
        <div className="header-badges">
          <span className="badge">{item.status}</span>
          <span className="badge">{item.provider ?? 'abonelik yok'}</span>
        </div>
      </div>
      {query.mesaj ? <p className="notice success">{query.mesaj}</p> : null}
      {query.hata ? <p className="notice error">{query.hata}</p> : null}
      <section className="card">
        <dl className="detail-grid">
          <div>
            <dt>Plan</dt>
            <dd>
              {item.planCode
                ? `${PLAN_DEFINITIONS[item.planCode].label} · ${getPlanPriceLabel(item.planCode, item.billingCycle ?? 'monthly')}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Billing cycle</dt>
            <dd>{item.billingCycle ?? '—'}</dd>
          </div>
          <div>
            <dt>Subscription status</dt>
            <dd>{item.status}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{item.provider ?? '—'}</dd>
          </div>
          <div>
            <dt>Trial ends</dt>
            <dd>{date(item.trialEndsAt)}</dd>
          </div>
          <div>
            <dt>Current period start</dt>
            <dd>{date(item.currentPeriodStart)}</dd>
          </div>
          <div>
            <dt>Current period end</dt>
            <dd>{date(item.currentPeriodEnd)}</dd>
          </div>
          <div>
            <dt>Cancel at period end</dt>
            <dd>{item.cancelAtPeriodEnd ? 'Evet' : 'Hayır'}</dd>
          </div>
          <div>
            <dt>Customer reference</dt>
            <dd>{item.providerCustomerReference ?? '—'}</dd>
          </div>
          <div>
            <dt>Subscription reference</dt>
            <dd>{item.providerSubscriptionReference ?? '—'}</dd>
          </div>
        </dl>
      </section>
      <section className="section">
        <h2>Kullanım</h2>
        <div className="cards">
          <article className="card">
            <div className="muted">Kullanıcılar</div>
            <div className="metric">
              {item.usage.activeUsers} / {item.limits.maxUsers}
            </div>
          </article>
          <article className="card">
            <div className="muted">Aktif danışanlar</div>
            <div className="metric">
              {item.usage.activeClients} / {item.limits.maxClients ?? '∞'}
            </div>
          </article>
          <article className="card">
            <div className="muted">SMS · mevcut dönem</div>
            <div className="metric">
              {item.usage.smsSent} / {item.limits.smsQuotaPerMonth}
            </div>
          </article>
        </div>
      </section>
      <section className="section">
        <h2>Abonelik tutarlılığı</h2>
        <div className="card">
          {item.drift.length === 0 ? (
            <p className="success-text">✓ Tutarlı</p>
          ) : (
            <>
              <p className="error-text">⚠ {item.drift.length} tutarsızlık bulundu</p>
              <ul>
                {item.drift.map((drift) => (
                  <li key={drift.code}>{drift.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
      {canManage ? (
        <section className="section">
          <h2>Güvenli operasyonlar</h2>
          {!manual && item.subscriptionId ? (
            <div className="notice external-notice">
              <strong>Harici sağlayıcı yönetimi</strong>
              <p>
                Bu abonelik harici ödeme sağlayıcısı tarafından yönetiliyor. Bu işlem mevcut
                entegrasyon tarafından desteklenmiyor; DB-only mutasyonlar kapalıdır.
              </p>
            </div>
          ) : (
            <div className="action-panels">
              {item.status === 'trialing' ? (
                <form className="card compact-form" action={extendTrialAction}>
                  <h3>Denemeyi uzat</h3>
                  {hidden}
                  <label>
                    Gün
                    <select className="input" name="days" defaultValue="7">
                      <option>7</option>
                      <option>14</option>
                      <option>30</option>
                      <option>60</option>
                      <option>90</option>
                    </select>
                  </label>
                  <label>
                    Gerekçe
                    <textarea
                      className="input textarea"
                      name="reason"
                      required
                      minLength={5}
                      maxLength={500}
                    />
                  </label>
                  <button className="button" type="submit">
                    Denemeyi uzat
                  </button>
                </form>
              ) : null}
              {item.subscriptionId ? (
                <>
                  <form className="card compact-form" action={changePlanAction}>
                    <h3>Plan değiştir</h3>
                    {hidden}
                    <label>
                      Yeni plan
                      <select className="input" name="planCode" defaultValue={item.planCode ?? ''}>
                        {SUBSCRIPTION_PLANS.map((value) => (
                          <option key={value} value={value}>
                            {PLAN_DEFINITIONS[value].label} ·{' '}
                            {getPlanPriceLabel(value, item.billingCycle ?? 'monthly')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="muted">
                      Yeni plan limitleri mevcut kullanımın altındaysa işlem reddedilir.
                    </p>
                    <label>
                      Gerekçe
                      <textarea
                        className="input textarea"
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                    <button className="button" type="submit">
                      Planı değiştir
                    </button>
                  </form>
                  <form className="card compact-form" action={changeBillingCycleAction}>
                    <h3>Billing cycle değiştir</h3>
                    {hidden}
                    <label>
                      Dönem
                      <select
                        className="input"
                        name="billingCycle"
                        defaultValue={item.billingCycle ?? 'monthly'}
                      >
                        {SUBSCRIPTION_BILLING_CYCLES.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Gerekçe
                      <textarea
                        className="input textarea"
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                    <button className="button" type="submit">
                      Dönemi değiştir
                    </button>
                  </form>
                  <form className="card compact-form" action={setCancellationAction}>
                    <h3>
                      {item.cancelAtPeriodEnd ? 'İptal talebini geri al' : 'Dönem sonunda iptal et'}
                    </h3>
                    {hidden}
                    <input
                      type="hidden"
                      name="cancelAtPeriodEnd"
                      value={item.cancelAtPeriodEnd ? 'false' : 'true'}
                    />
                    <p className="muted">Mevcut erişim hemen kesilmez.</p>
                    <label>
                      Gerekçe
                      <textarea
                        className="input textarea"
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                    <button
                      className={item.cancelAtPeriodEnd ? 'button' : 'button danger-button'}
                      type="submit"
                    >
                      {item.cancelAtPeriodEnd ? 'Talebi geri al' : 'İptal talebi oluştur'}
                    </button>
                  </form>
                  <form className="card compact-form" action={correctStatusAction}>
                    <h3>Durum düzeltmesi</h3>
                    {hidden}
                    <label>
                      Yeni durum
                      <select className="input" name="status" defaultValue={item.status}>
                        {SUBSCRIPTION_STATUSES.map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Gerekçe
                      <textarea
                        className="input textarea"
                        name="reason"
                        required
                        minLength={5}
                        maxLength={500}
                      />
                    </label>
                    <button className="button" type="submit">
                      Durumu düzelt
                    </button>
                  </form>
                  {item.status !== 'active' ? (
                    <form className="card compact-form" action={activateSubscriptionAction}>
                      <h3>Manuel aboneliği aktive et</h3>
                      {hidden}
                      <label>
                        Gerekçe
                        <textarea
                          className="input textarea"
                          name="reason"
                          required
                          minLength={5}
                          maxLength={500}
                        />
                      </label>
                      <button className="button" type="submit">
                        Aktive et
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <p className="card muted">
                  Deneme süresi abonelik satırı olmadan uzatılabilir. Diğer operasyonlar canonical
                  abonelik satırı gerektirir.
                </p>
              )}
            </div>
          )}
        </section>
      ) : null}
      <section className="section">
        <h2>Abonelik Geçmişi</h2>
        <div className="timeline">
          {item.events.length === 0 ? (
            <p className="card muted">Abonelik olayı yok.</p>
          ) : (
            item.events.map((event) => (
              <article className="card" key={event.id}>
                <strong>{event.eventType}</strong>
                <p>{payloadLine(event)}</p>
                <small className="muted">
                  {event.occurredAt.toLocaleString('tr-TR')} ·{' '}
                  {event.actorName ??
                    (event.source === 'provider'
                      ? 'Ödeme sağlayıcısı'
                      : event.source === 'system'
                        ? 'Sistem'
                        : event.source === 'platform_staff'
                          ? 'Platform personeli'
                          : 'Klinik kullanıcısı')}
                </small>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  )
}
