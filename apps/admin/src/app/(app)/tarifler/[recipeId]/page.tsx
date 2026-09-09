import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getRecipeForPlatform, listIngredientFoodsForPlatform } from '@ogun/db/queries'
import { FoodOperationsNav } from '@/components/food-operations-nav'
import { OperationFeedback } from '@/components/operation-feedback'
import { SubmitButton } from '@/components/submit-button'
import { requirePlatformPermission } from '@/lib/platform-authz'
import {
  addRecipeReferenceAction,
  saveRecipeIngredientsAction,
  submitRecipeForReviewAction,
  transitionRecipeAction,
  updateRecipeAction,
} from '../actions'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const coreCodes = ['ENERC_KCAL', 'PROCNT', 'CHOCDF', 'FAT', 'FIBTG']
export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ recipeId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('foods.read'),
    { recipeId } = await params,
    q = await searchParams,
    recipe = await getRecipeForPlatform(db, recipeId)
  if (!recipe) notFound()
  const editable = recipe.isPlatformManaged && ctx.permissions.includes('foods.write'),
    canPublish = ctx.permissions.includes('foods.publish'),
    search = one(q.foodSearch) ?? '',
    candidates = editable && search ? await listIngredientFoodsForPlatform(db, search) : []
  const transitions: Record<string, string[]> = {
    in_review: ['draft', 'published'],
    published: ['archived'],
    archived: ['draft'],
  }
  const calculated = recipe.calculation
    ? Object.values(recipe.calculation.nutrients).sort(
        (a, b) =>
          (coreCodes.indexOf(a.code) < 0 ? 99 : coreCodes.indexOf(a.code)) -
          (coreCodes.indexOf(b.code) < 0 ? 99 : coreCodes.indexOf(b.code)),
      )
    : []
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/tarifler">Tarifler</Link> / {recipe.nameTr}
      </div>
      <div className="page-head">
        <div>
          <h1>{recipe.nameTr}</h1>
          <p className="muted">Global sistem tarifi · clinicId=null</p>
        </div>
        <div className="header-badges">
          <span className="badge">{recipe.editorialStatus}</span>
          <span className={`badge ${recipe.isPublic ? 'success' : ''}`}>
            {recipe.isPublic ? 'Public' : 'Private draft'}
          </span>
        </div>
      </div>
      <FoodOperationsNav active="/tarifler" />
      <OperationFeedback message={one(q.mesaj)} error={one(q.hata)} />
      {!editable ? (
        <div className="notice">Bu tarif salt okunur görüntüleniyor; düzenleme yetkiniz yok.</div>
      ) : null}
      <section className="card">
        <h2>Genel</h2>
        {editable ? (
          <form className="stack section" action={updateRecipeAction}>
            <input type="hidden" name="recipeId" value={recipeId} />
            <label className="field">
              <span>Tarif adı</span>
              <input className="input" name="nameTr" defaultValue={recipe.nameTr} required />
            </label>
            <div className="detail-grid">
              <label className="field">
                <span>Porsiyon</span>
                <input
                  className="input"
                  name="servings"
                  type="number"
                  min={1}
                  defaultValue={recipe.servings}
                  required
                />
              </label>
              <label className="field">
                <span>Pişmiş toplam ağırlık (g)</span>
                <input
                  className="input"
                  name="totalYieldGrams"
                  defaultValue={recipe.totalYieldGrams ?? ''}
                  required
                />
              </label>
              <label className="field">
                <span>Pişirme yöntemi</span>
                <input
                  className="input"
                  name="cookingMethod"
                  defaultValue={recipe.cookingMethod ?? ''}
                />
              </label>
            </div>
            <label className="field">
              <span>Hazırlama talimatı</span>
              <textarea
                className="input textarea"
                name="instructions"
                defaultValue={recipe.instructions ?? ''}
              />
            </label>
            <SubmitButton />
          </form>
        ) : (
          <dl className="detail-grid section">
            <div>
              <dt>Porsiyon</dt>
              <dd>{recipe.servings}</dd>
            </div>
            <div>
              <dt>Pişmiş toplam ağırlık</dt>
              <dd>{recipe.totalYieldGrams ? `${recipe.totalYieldGrams} g` : '—'}</dd>
            </div>
            <div>
              <dt>Pişirme yöntemi</dt>
              <dd>{recipe.cookingMethod ?? '—'}</dd>
            </div>
            <div>
              <dt>Hazırlama talimatı</dt>
              <dd>{recipe.instructions ?? '—'}</dd>
            </div>
          </dl>
        )}
      </section>
      <section className="section card">
        <h2>Malzemeler</h2>
        {editable ? (
          <>
            <form className="stack" action={saveRecipeIngredientsAction}>
              <input type="hidden" name="recipeId" value={recipeId} />
              <div className="portion-editor">
                {recipe.ingredients.map((i) => (
                  <div className="portion-row" key={i.id}>
                    <input type="hidden" name="foodId" value={i.foodId} />
                    <input type="hidden" name="portionId" value={i.portionId ?? ''} />
                    <strong>{i.foodName}</strong>
                    <input
                      className="input"
                      name="amountGrams"
                      defaultValue={i.amountGrams}
                      inputMode="decimal"
                    />
                    <label>
                      <input type="checkbox" name="removeFoodId" value={i.foodId} /> Kaldır
                    </label>
                  </div>
                ))}
              </div>
              {candidates.length ? (
                <div className="stack">
                  <h3>Arama sonucu ekle</h3>
                  {candidates.map((food) => (
                    <label key={food.id}>
                      <input type="radio" name="newFoodId" value={food.id} /> {food.nameTr}
                    </label>
                  ))}
                  <input className="input" name="newAmountGrams" placeholder="Yeni malzeme gramı" />
                </div>
              ) : null}
              <SubmitButton>Malzemeleri kaydet</SubmitButton>
            </form>
            <form className="section filter-grid">
              <input type="hidden" name="mesaj" value={one(q.mesaj) ?? ''} />
              <label>
                Besin ara
                <input
                  className="input"
                  name="foodSearch"
                  defaultValue={search}
                  placeholder="Yayınlanmış besin"
                />
              </label>
              <button className="button">Ara</button>
            </form>
          </>
        ) : (
          <ul>
            {recipe.ingredients.map((i) => (
              <li key={i.id}>
                {i.foodName} · {i.amountGrams} g
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="section card">
        <h2>Besin Değerleri</h2>
        {recipe.cookingWarning ? <div className="notice">{recipe.cookingWarning}</div> : null}
        {recipe.calculation ? (
          <div className="table-wrap section">
            <table>
              <thead>
                <tr>
                  <th>Nutrient</th>
                  <th>Toplam</th>
                  <th>100 g</th>
                  <th>1 porsiyon</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {calculated.map((n) => (
                  <tr key={n.code}>
                    <td>
                      <code>{n.code}</code>
                    </td>
                    <td>{n.total?.toFixed(4) ?? 'Eksik'}</td>
                    <td>{n.per100g?.toFixed(4) ?? 'Eksik'}</td>
                    <td>{n.perServing?.toFixed(4) ?? 'Eksik'}</td>
                    <td>
                      <span className={`badge ${n.complete ? 'success' : 'failure'}`}>
                        %{n.coveragePercent.toFixed(1)} {n.complete ? 'tam' : 'kısmi veri'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Hesaplama için malzeme ve toplam pişmiş ağırlık girin.</p>
        )}
        <p className="muted">
          Değerler preferred food nutrient satırlarından hesaplanır; manual override yoktur.
        </p>
      </section>
      <section className="section card">
        <h2>Kaynak / provenance</h2>
        {recipe.references.map((r) => (
          <article className="section" key={r.id}>
            <strong>{r.title}</strong>
            <div>{r.citation}</div>
            {r.url ? (
              <a className="table-link" href={r.url} target="_blank" rel="noreferrer">
                Kaynağı aç
              </a>
            ) : null}
          </article>
        ))}
        {editable ? (
          <form className="stack section" action={addRecipeReferenceAction}>
            <input type="hidden" name="recipeId" value={recipeId} />
            <input className="input" name="title" placeholder="Kaynak başlığı" required />
            <textarea className="input textarea" name="citation" placeholder="Citation" required />
            <input className="input" name="url" placeholder="https://…" />
            <textarea className="input textarea" name="note" placeholder="Not" />
            <SubmitButton>Kaynak ekle</SubmitButton>
          </form>
        ) : null}
      </section>
      {editable ? (
        <section className="section card">
          <h2>Editorial workflow</h2>
          <div className="actions">
            {recipe.editorialStatus === 'draft' ? (
              <form action={submitRecipeForReviewAction}>
                <input type="hidden" name="recipeId" value={recipeId} />
                <SubmitButton>Kontrole gönder</SubmitButton>
              </form>
            ) : null}
            {canPublish
              ? (transitions[recipe.editorialStatus] ?? []).map((target) => (
                  <form action={transitionRecipeAction} key={target}>
                    <input type="hidden" name="recipeId" value={recipeId} />
                    <input type="hidden" name="toStatus" value={target} />
                    <SubmitButton
                      className={target === 'archived' ? 'button danger-button' : 'button'}
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
              {recipe.events.map((e) => (
                <tr key={e.id}>
                  <td>{e.eventType}</td>
                  <td>{e.createdAt.toLocaleString('tr-TR')}</td>
                  <td className="wrap-cell">
                    <code>{JSON.stringify(e.changes ?? {})}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
