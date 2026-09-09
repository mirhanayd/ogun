import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getFoodForPlatform } from '@ogun/db/queries'
import { FoodOperationsNav } from '@/components/food-operations-nav'
import { OperationFeedback } from '@/components/operation-feedback'
import { SubmitButton } from '@/components/submit-button'
import { requirePlatformPermission } from '@/lib/platform-authz'
import {
  addFoodReferenceAction,
  saveFoodNutrientsAction,
  saveFoodPortionsAction,
  submitFoodForReviewAction,
  transitionFoodAction,
  updateFoodAction,
} from '../actions'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const categoryLabels: Record<string, string> = {
  makro: 'Makrolar',
  vitamin: 'Vitaminler',
  mineral: 'Mineraller',
  yağ_asidi: 'Yağ asitleri',
  amino_asit: 'Amino asitler',
  diğer: 'Diğer',
}
export default async function FoodDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ foodId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('foods.read'),
    { foodId } = await params,
    q = await searchParams,
    food = await getFoodForPlatform(db, foodId)
  if (!food) notFound()
  const platformManaged = food.isPlatformManaged && food.source === 'OGUN',
    editable = platformManaged && ctx.permissions.includes('foods.write'),
    canPublish = ctx.permissions.includes('foods.publish')
  const preferred = new Map(
    food.nutrients.filter((n) => n.isPreferred).map((n) => [n.nutrientId, n.valuePer100g]),
  )
  const grouped = food.definitions.reduce<Record<string, typeof food.definitions>>(
    (result, nutrient) => {
      const category = result[nutrient.category] ?? []
      category.push(nutrient)
      result[nutrient.category] = category
      return result
    },
    {},
  )
  const transitions: Record<string, string[]> = {
    in_review: ['draft', 'published'],
    published: ['archived'],
    archived: ['draft'],
  }
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/besinler">Besinler</Link> / {food.nameTr}
      </div>
      <div className="page-head">
        <div>
          <h1>{food.nameTr}</h1>
          <p className="muted">
            {food.source} · {food.groupNameTr ?? 'Grupsuz'}
          </p>
        </div>
        <div className="header-badges">
          <span className="badge">{food.editorialStatus}</span>
          <span className={`badge ${food.isVerified ? 'success' : ''}`}>
            {food.isVerified ? 'Doğrulanmış' : 'Doğrulanmamış'}
          </span>
        </div>
      </div>
      <FoodOperationsNav active="/besinler" />
      <OperationFeedback message={one(q.mesaj)} error={one(q.hata)} />
      {!platformManaged ? (
        <div className="notice external-notice">
          <strong>Bu kayıt harici veri kaynağından yönetilmektedir.</strong>
          <br />
          Doğrudan düzenleme yapılamaz.
        </div>
      ) : null}
      {platformManaged && !editable ? (
        <div className="notice">Bu kayıt salt okunur görüntüleniyor; düzenleme yetkiniz yok.</div>
      ) : null}
      <section className="card section">
        <h2>Genel</h2>
        {editable ? (
          <form className="stack" action={updateFoodAction}>
            <input type="hidden" name="foodId" value={foodId} />
            <div className="detail-grid">
              <label className="field">
                <span>Türkçe ad</span>
                <input className="input" name="nameTr" defaultValue={food.nameTr} required />
              </label>
              <label className="field">
                <span>İngilizce ad</span>
                <input className="input" name="nameEn" defaultValue={food.nameEn ?? ''} />
              </label>
              <label className="field">
                <span>Hazırlama</span>
                <select className="input" name="preparation" defaultValue={food.preparation ?? ''}>
                  <option value="">Belirtilmedi</option>
                  {['çiğ', 'haşlanmış', 'kızartılmış', 'fırınlanmış', 'ızgara', 'buğulama'].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span>Grup kodu</span>
                <input className="input" name="groupCode" defaultValue={food.groupCode ?? ''} />
              </label>
              <label className="field">
                <span>Grup adı</span>
                <input className="input" name="groupNameTr" defaultValue={food.groupNameTr ?? ''} />
              </label>
            </div>
            <SubmitButton />
          </form>
        ) : (
          <dl className="detail-grid">
            <div>
              <dt>İngilizce ad</dt>
              <dd>{food.nameEn ?? '—'}</dd>
            </div>
            <div>
              <dt>Hazırlama</dt>
              <dd>{food.preparation ?? '—'}</dd>
            </div>
            <div>
              <dt>Search text</dt>
              <dd>{food.searchText}</dd>
            </div>
          </dl>
        )}
      </section>
      <section className="section">
        <div className="page-head compact-head">
          <div>
            <h2>Besin Öğeleri</h2>
            <p className="muted">
              Mikro besin kapsamı: {food.microCoverage.known} / {food.microCoverage.total}. Boş alan
              eksiktir; sıfır değildir.
            </p>
          </div>
        </div>
        {editable ? (
          <form action={saveFoodNutrientsAction}>
            <input type="hidden" name="foodId" value={foodId} />
            {Object.entries(grouped).map(([category, definitions]) => (
              <div className="card nutrient-group" key={category}>
                <h2>{categoryLabels[category] ?? category}</h2>
                <div className="nutrient-grid">
                  {definitions?.map((n) => (
                    <label className="nutrient-row" key={n.id}>
                      <span>
                        {n.nameTr}
                        <small>{n.code}</small>
                      </span>
                      <input
                        className="input"
                        inputMode="decimal"
                        name={`nutrient:${n.id}`}
                        defaultValue={preferred.get(n.id) ?? ''}
                        placeholder="Eksik"
                      />
                      <code>{n.unit}</code>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <SubmitButton className="button sticky-save" pending="Kaydediliyor…">
              Besin öğelerini kaydet
            </SubmitButton>
          </form>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Besin öğesi</th>
                  <th>Değer / 100 g</th>
                  <th>Birim</th>
                  <th>Kaynak</th>
                </tr>
              </thead>
              <tbody>
                {food.nutrients.map((n) => (
                  <tr key={`${n.nutrientId}-${n.source}`}>
                    <td>{n.nameTr}</td>
                    <td>{n.valuePer100g}</td>
                    <td>{n.unit}</td>
                    <td>
                      {n.source}
                      {n.isPreferred ? ' · preferred' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="section card">
        <h2>Porsiyonlar</h2>
        {editable ? (
          <form className="stack" action={saveFoodPortionsAction}>
            <input type="hidden" name="foodId" value={foodId} />
            <div className="portion-editor">
              {[...food.portions, null].map((p, i) => (
                <div className="portion-row" key={p?.id ?? 'new'}>
                  <input
                    className="input"
                    name="portionLabel"
                    defaultValue={p?.label ?? ''}
                    placeholder="Etiket"
                  />
                  <input
                    className="input"
                    name="portionGrams"
                    defaultValue={p?.grams ?? ''}
                    placeholder="Gram"
                    inputMode="decimal"
                  />
                  <label>
                    <input
                      type="radio"
                      name="defaultIndex"
                      value={i}
                      defaultChecked={p?.isDefault}
                    />{' '}
                    Varsayılan
                  </label>
                  <span>Sıra {i + 1}</span>
                </div>
              ))}
            </div>
            <SubmitButton>Porsiyonları kaydet</SubmitButton>
          </form>
        ) : (
          <ul>
            {food.portions.map((p) => (
              <li key={p.id}>
                {p.label} · {p.grams} g {p.isDefault ? '· Varsayılan' : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="section card">
        <h2>Kaynak / provenance</h2>
        <div className="stack">
          {food.references.map((r) => (
            <article key={r.id}>
              <strong>{r.title}</strong>
              <div>{r.citation}</div>
              {r.url ? (
                <a className="table-link" href={r.url} rel="noreferrer" target="_blank">
                  Kaynağı aç
                </a>
              ) : null}
              <p className="muted">{r.note}</p>
            </article>
          ))}
        </div>
        {editable ? (
          <form className="stack section" action={addFoodReferenceAction}>
            <input type="hidden" name="foodId" value={foodId} />
            <input className="input" name="title" placeholder="Kaynak başlığı" required />
            <textarea className="input textarea" name="citation" placeholder="Citation" required />
            <input className="input" name="url" placeholder="https://… (opsiyonel)" />
            <textarea className="input textarea" name="note" placeholder="Kaynak notu" />
            <SubmitButton>Kaynak ekle</SubmitButton>
          </form>
        ) : null}
      </section>
      {editable ? (
        <section className="section card">
          <h2>Editorial workflow</h2>
          <div className="actions">
            {food.editorialStatus === 'draft' ? (
              <form action={submitFoodForReviewAction}>
                <input type="hidden" name="foodId" value={foodId} />
                <SubmitButton pending="Gönderiliyor…">Kontrole gönder</SubmitButton>
              </form>
            ) : null}
            {canPublish
              ? (transitions[food.editorialStatus] ?? []).map((target) => (
                  <form action={transitionFoodAction} key={target}>
                    <input type="hidden" name="foodId" value={foodId} />
                    <input type="hidden" name="toStatus" value={target} />
                    <SubmitButton
                      className={target === 'archived' ? 'button danger-button' : 'button'}
                      pending="İşleniyor…"
                    >
                      {target === 'published'
                        ? 'Yayınla'
                        : target === 'archived'
                          ? 'Arşivle'
                          : 'Taslağa döndür'}
                    </SubmitButton>
                  </form>
                ))
              : null}
          </div>
        </section>
      ) : null}
      <section className="section">
        <h2>Değişiklik geçmişi</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Olay</th>
                <th>Zaman</th>
                <th>Değişiklik</th>
              </tr>
            </thead>
            <tbody>
              {food.events.map((e) => (
                <tr key={e.id}>
                  <td>{e.eventType}</td>
                  <td>{e.createdAt.toLocaleString('tr-TR')}</td>
                  <td className="wrap-cell">
                    <code>{JSON.stringify(e.changes ?? {})}</code>
                  </td>
                </tr>
              ))}
              {!food.events.length ? (
                <tr>
                  <td colSpan={3}>Geçmiş yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
