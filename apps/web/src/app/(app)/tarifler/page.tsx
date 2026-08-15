import { UtensilsCrossed } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

// Tarif kütüphanesi — packages/db/src/schema/recipes.ts ile ilişkili,
// diyet planı editörüne bağlanacak.
export default function TariflerPage() {
  return (
    <EmptyState
      icon={UtensilsCrossed}
      title="Henüz tarif yok"
      description="Plan editöründe kullanılacak tarif kütüphanesi yakında burada olacak."
      action={{ label: 'Yeni tarif ekle', disabled: true, hint: 'Yakında' }}
    />
  )
}
