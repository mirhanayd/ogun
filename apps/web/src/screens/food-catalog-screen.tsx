import { useState } from 'react'
import { Search, UtensilsCrossed } from 'lucide-react'
import { FoodSearchInput, type FoodSearchSelection } from '@/components/food-search-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScreenFrame } from './screen-frame'

export function FoodCatalogScreen() {
  const [selection, setSelection] = useState<FoodSearchSelection | null>(null)
  return (
    <ScreenFrame eyebrow="Yerel katalog" title="Besin arama" description="Besin kataloğu cihazdaki indeksli SQLite tablosunda aranır; bağlantı gerekmez." icon={UtensilsCrossed}>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Search className="size-4 text-primary" />Katalogda ara</CardTitle></CardHeader>
        <CardContent><FoodSearchInput onSelect={setSelection} placeholder="Besin adı, tarif veya porsiyon ara…" showLatencyBadge /></CardContent>
      </Card>
      {selection ? <Card><CardHeader><CardTitle>{selection.nameTr}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Enerji / 100 g</p><p className="font-semibold">{selection.kcalPer100g ?? '—'} kcal</p></div><div><p className="text-xs text-muted-foreground">Protein</p><p className="font-semibold">{selection.proteinPer100g ?? '—'} g</p></div><div><p className="text-xs text-muted-foreground">Karbonhidrat</p><p className="font-semibold">{selection.carbPer100g ?? '—'} g</p></div><div><p className="text-xs text-muted-foreground">Yağ</p><p className="font-semibold">{selection.fatPer100g ?? '—'} g</p></div></CardContent></Card> : null}
    </ScreenFrame>
  )
}
