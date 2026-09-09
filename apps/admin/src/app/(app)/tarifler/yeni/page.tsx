import Link from 'next/link'
import { FoodOperationsNav } from '@/components/food-operations-nav'
import { OperationFeedback } from '@/components/operation-feedback'
import { SubmitButton } from '@/components/submit-button'
import { requirePlatformPermission } from '@/lib/platform-authz'
import { createRecipeAction } from '../actions'

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requirePlatformPermission('foods.write')
  const q = await searchParams
  return (
    <>
      <div className="breadcrumbs">
        <Link href="/tarifler">Tarifler</Link> / Yeni
      </div>
      <div className="page-head">
        <div>
          <h1>Yeni sistem tarifi</h1>
          <p className="muted">Global taslak; nutrient değerleri malzemelerden hesaplanır.</p>
        </div>
      </div>
      <FoodOperationsNav active="/tarifler" />
      <OperationFeedback message={one(q.mesaj)} error={one(q.hata)} />
      <form className="card stack catalog-form" action={createRecipeAction}>
        <label className="field">
          <span>Tarif adı *</span>
          <input className="input" name="nameTr" minLength={2} required />
        </label>
        <div className="detail-grid">
          <label className="field">
            <span>Porsiyon sayısı *</span>
            <input
              className="input"
              name="servings"
              type="number"
              min={1}
              step={1}
              defaultValue={1}
              required
            />
          </label>
          <label className="field">
            <span>Pişmiş toplam ağırlık (g) *</span>
            <input className="input" name="totalYieldGrams" inputMode="decimal" required />
          </label>
          <label className="field">
            <span>Pişirme yöntemi</span>
            <input className="input" name="cookingMethod" />
          </label>
        </div>
        <label className="field">
          <span>Hazırlama talimatı</span>
          <textarea className="input textarea" name="instructions" />
        </label>
        <div className="notice">
          Hesaplanan makro/mikro değerler elle girilmez; malzeme gramlarından türetilir.
        </div>
        <SubmitButton pending="Oluşturuluyor…">Taslak tarif oluştur</SubmitButton>
      </form>
    </>
  )
}
