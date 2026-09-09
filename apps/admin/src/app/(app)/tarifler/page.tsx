import Link from 'next/link'
import { db } from '@ogun/db'
import { listRecipesForPlatform } from '@ogun/db/queries'
import type { CatalogEditorialStatus } from '@ogun/db/schema'
import { FoodOperationsNav } from '@/components/food-operations-nav'
import { requirePlatformPermission } from '@/lib/platform-authz'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const statuses: CatalogEditorialStatus[] = ['draft', 'in_review', 'published', 'archived']
export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('foods.read'),
    q = await searchParams,
    rawStatus = one(q.status)
  const result = await listRecipesForPlatform(db, {
    search: one(q.q),
    status: statuses.includes(rawStatus as CatalogEditorialStatus)
      ? (rawStatus as CatalogEditorialStatus)
      : undefined,
    cookingMethod: one(q.cookingMethod),
    page: Number(one(q.page) ?? 1),
    pageSize: [25, 50, 100].includes(Number(one(q.pageSize)))
      ? (Number(one(q.pageSize)) as 25 | 50 | 100)
      : 25,
  })
  const pageHref = (page: number) => {
    const p = new URLSearchParams()
    for (const [key, value] of Object.entries(q))
      if (typeof value === 'string' && key !== 'page') p.set(key, value)
    p.set('page', String(page))
    return `/tarifler?${p}`
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sistem Tarifleri</h1>
          <p className="muted">Yalnız global, clinicId=null tarif kataloğu</p>
        </div>
        {ctx.permissions.includes('foods.write') ? (
          <Link className="button action-link" href="/tarifler/yeni">
            Yeni tarif
          </Link>
        ) : null}
      </div>
      <FoodOperationsNav active="/tarifler" />
      <form className="filter-grid">
        <label>
          Arama
          <input className="input" name="q" defaultValue={one(q.q)} />
        </label>
        <label>
          Durum
          <select className="input" name="status" defaultValue={rawStatus}>
            <option value="">Tümü</option>
            {statuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Pişirme yöntemi
          <input className="input" name="cookingMethod" defaultValue={one(q.cookingMethod)} />
        </label>
        <button className="button">Filtrele</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tarif</th>
              <th>Durum</th>
              <th>Porsiyon</th>
              <th>Toplam pişmiş ağırlık</th>
              <th>Malzeme</th>
              <th>Pişirme</th>
              <th>Oluşturulma</th>
              <th>Güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link className="table-link" href={`/tarifler/${r.id}`}>
                    {r.nameTr}
                  </Link>
                </td>
                <td>
                  <span className="badge">{r.editorialStatus}</span>
                </td>
                <td>{r.servings}</td>
                <td>{r.totalYieldGrams ?? '—'} g</td>
                <td>{r.ingredientCount}</td>
                <td>{r.cookingMethod ?? '—'}</td>
                <td>{r.createdAt.toLocaleString('tr-TR')}</td>
                <td>{r.updatedAt.toLocaleString('tr-TR')}</td>
              </tr>
            ))}
            {!result.rows.length ? (
              <tr>
                <td colSpan={8} className="muted">
                  Sistem tarifi bulunamadı.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          {result.total} kayıt · Sayfa {result.page}
        </span>
        {result.page > 1 ? <Link href={pageHref(result.page - 1)}>Önceki</Link> : null}
        {result.page * result.pageSize < result.total ? (
          <Link href={pageHref(result.page + 1)}>Sonraki</Link>
        ) : null}
      </div>
    </>
  )
}
