import Link from 'next/link'
import { db } from '@ogun/db'
import { listFoodsForPlatform, type PlatformFoodFilters } from '@ogun/db/queries'
import type { CatalogEditorialStatus } from '@ogun/db/schema'
import { FoodOperationsNav } from '@/components/food-operations-nav'
import { requirePlatformPermission } from '@/lib/platform-authz'

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const statuses: CatalogEditorialStatus[] = ['draft', 'in_review', 'published', 'archived']
export default async function FoodsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePlatformPermission('foods.read'),
    q = await searchParams
  const status = one(q.status)
  const filters: PlatformFoodFilters = {
    search: one(q.q),
    source: one(q.source),
    status: statuses.includes(status as CatalogEditorialStatus)
      ? (status as CatalogEditorialStatus)
      : undefined,
    preparation: one(q.preparation),
    group: one(q.group),
    verified: one(q.verified) === 'true' ? true : one(q.verified) === 'false' ? false : undefined,
    needsTranslation: one(q.translation) === 'true' ? true : undefined,
    page: Number(one(q.page) ?? 1),
    pageSize: [25, 50, 100].includes(Number(one(q.pageSize)))
      ? (Number(one(q.pageSize)) as 25 | 50 | 100)
      : 25,
  }
  const result = await listFoodsForPlatform(db, filters),
    canWrite = ctx.permissions.includes('foods.write')
  const pageHref = (page: number) => {
    const p = new URLSearchParams()
    for (const [key, value] of Object.entries(q))
      if (typeof value === 'string' && key !== 'page') p.set(key, value)
    p.set('page', String(page))
    return `/besinler?${p}`
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Besin Veritabanı</h1>
          <p className="muted">İçe aktarılan katalog ve OGUN editorial içerikleri</p>
        </div>
        {canWrite ? (
          <Link className="button action-link" href="/besinler/yeni">
            Yeni besin
          </Link>
        ) : null}
      </div>
      <FoodOperationsNav active="/besinler" />
      <form className="filter-grid">
        <label>
          Arama
          <input className="input" name="q" defaultValue={one(q.q)} />
        </label>
        <label>
          Kaynak
          <select className="input" name="source" defaultValue={one(q.source)}>
            <option value="">Tümü</option>
            {['OGUN', 'BLS4', 'USDA_FDN', 'USDA_SR', 'TURKOMP', 'OFF', 'CUSTOM'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Durum
          <select className="input" name="status" defaultValue={status}>
            <option value="">Tümü</option>
            {statuses.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Doğrulama
          <select className="input" name="verified" defaultValue={one(q.verified)}>
            <option value="">Tümü</option>
            <option value="true">Doğrulanmış</option>
            <option value="false">Doğrulanmamış</option>
          </select>
        </label>
        <label>
          Hazırlama
          <input className="input" name="preparation" defaultValue={one(q.preparation)} />
        </label>
        <label>
          Grup
          <input className="input" name="group" defaultValue={one(q.group)} />
        </label>
        <button className="button">Filtrele</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Besin adı</th>
              <th>Kaynak</th>
              <th>Grup</th>
              <th>Hazırlama</th>
              <th>Durum</th>
              <th>Doğrulama</th>
              <th>Nutrient coverage</th>
              <th>Porsiyon</th>
              <th>Güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((food) => (
              <tr key={food.id}>
                <td>
                  <Link className="table-link" href={`/besinler/${food.id}`}>
                    {food.nameTr}
                  </Link>
                </td>
                <td>{food.source}</td>
                <td>{food.groupNameTr ?? '—'}</td>
                <td>{food.preparation ?? '—'}</td>
                <td>
                  <span className="badge">{food.editorialStatus}</span>
                </td>
                <td>{food.isVerified ? 'Evet' : 'Hayır'}</td>
                <td>{food.nutrientCoverage}</td>
                <td>{food.portionCount}</td>
                <td>{food.updatedAt.toLocaleString('tr-TR')}</td>
              </tr>
            ))}
            {!result.rows.length ? (
              <tr>
                <td colSpan={9} className="muted">
                  Kayıt bulunamadı.
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
