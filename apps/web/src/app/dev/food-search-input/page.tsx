'use client'

import { useRef, useState } from 'react'
import { FoodSearchInput, type FoodSearchSelection } from '@/components/food-search-input'
import { Input } from '@/components/ui/input'

// GitHub issue #24 / Prompt 5.2 — FoodSearchInput'un STANDALONE bileşen
// olarak nasıl kullanılacağını gösteren geliştirme sayfası. dev/food-search
// (Hafta 1) sadece Dexie+Orama indeksini ham haliyle sergiliyordu; bu sayfa
// bir seviye üstte, GERÇEK ürün bileşenini (doğal dil ayrıştırma + klavye
// gezinme + Tab-ile-miktara-geç + pinlenmiş liste + gecikme rozeti dahil)
// sergiliyor. #25 plan editörü UI'ı bu bileşeni buradan kopyalayıp kendi
// "aktif öğün" state'ine bağlayacak.
export default function FoodSearchInputDevPage() {
  const [selections, setSelections] = useState<FoodSearchSelection[]>([])
  const quantityRef = useRef<HTMLInputElement>(null)

  function handleSelect(selection: FoodSearchSelection) {
    setSelections((prev) => [selection, ...prev].slice(0, 10))
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Hızlı Besin Girişi (geliştirme)</h1>
      <p className="text-sm text-muted-foreground">
        ↑↓ ile gezin, Enter ile seç, Esc ile kapat, Tab ile miktar alanına geç.
      </p>

      <FoodSearchInput onSelect={handleSelect} quantityInputRef={quantityRef} autoFocus />

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="quantity">
          Miktar (g)
        </label>
        <Input id="quantity" ref={quantityRef} placeholder="Tab ile buraya gelinir" />
      </div>

      <ul className="divide-y">
        {selections.map((selection, index) => (
          <li key={`${selection.foodId}-${index}`} className="py-2 text-sm">
            <span className="font-medium">
              {selection.amount}
              {selection.unit ?? (selection.portion ? ` ${selection.portion}` : '')} {selection.nameTr}
            </span>
            <span className="ml-2 text-muted-foreground">
              {selection.groupNameTr ?? '—'}
              {selection.kcalPer100g !== null ? ` · ${selection.kcalPer100g.toFixed(0)} kcal/100g` : ''}
            </span>
          </li>
        ))}
      </ul>
    </main>
  )
}
