import Link from 'next/link'
import { FoodOperationsNav } from '@/components/food-operations-nav'
import { OperationFeedback } from '@/components/operation-feedback'
import { SubmitButton } from '@/components/submit-button'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { createFoodAction } from '../actions'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
export default async function NewFoodPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePlatformPermission('foods.write')
  const q = await searchParams
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/besinler">Besinler</Link> / Yeni
      </div>
      <div className="page-head">
        <div>
          <h1>Yeni OGUN besini</h1>
          <p className="muted">
            Taslak olarak oluşturulur; değerler sonraki ekranda canonical tanımlardan seçilir.
          </p>
        </div>
      </div>
      <FoodOperationsNav active="/besinler" />
      <OperationFeedback message={one(q.mesaj)} error={one(q.hata)} />
      <form className="card stack catalog-form" action={createFoodAction}>
        <label className="field">
          <span>Türkçe ad *</span>
          <input className="input" name="nameTr" required minLength={2} />
        </label>
        <label className="field">
          <span>İngilizce ad</span>
          <input className="input" name="nameEn" />
        </label>
        <div className="detail-grid">
          <label className="field">
            <span>Grup kodu</span>
            <input className="input" name="groupCode" />
          </label>
          <label className="field">
            <span>Grup adı</span>
            <input className="input" name="groupNameTr" />
          </label>
          <label className="field">
            <span>Hazırlama</span>
            <select className="input" name="preparation">
              <option value="">Belirtilmedi</option>
              {['çiğ', 'haşlanmış', 'kızartılmış', 'fırınlanmış', 'ızgara', 'buğulama'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="notice">
          Kaynak OGUN, durum Taslak ve doğrulama Hayır olarak server-side atanır. Search text
          otomatik üretilir.
        </div>
        <SubmitButton pending="Oluşturuluyor…">Taslak oluştur</SubmitButton>
      </form>
    </>
  )
}
