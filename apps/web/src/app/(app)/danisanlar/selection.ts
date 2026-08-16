import type { RowSelectionState } from '@tanstack/react-table'

// TanStack Table'ın rowSelection state'i, tabloya verdiğimiz getRowId
// fonksiyonu sayesinde (bkz. clients-table.tsx — satır id'si danışan id'si)
// { [clientId]: true } biçiminde bir haritadır. Toplu işlem çağrıları
// (archiveClientsAction, assignDietitianAction) düz bir id dizisi bekler —
// bu saf dönüşüm fonksiyonu, bileşen içine gömülü kalsaydı test edilemezdi.
export function selectedClientIds(rowSelection: RowSelectionState): string[] {
  return Object.entries(rowSelection)
    .filter(([, selected]) => selected)
    .map(([clientId]) => clientId)
}

// Toplu işlem araç çubuğundaki özet metni ("3 danışan seçildi") — tekil/çoğul
// ayrımını (Türkçe'de sayıdan sonra çoğul eki gerekmez, ama "1 danışan"
// tekil his verir, "0 danışan" ise araç çubuğunun hiç görünmemesi gereken
// bir durumdur) tek bir yerde topluyor.
export function selectionSummaryLabel(count: number): string {
  if (count <= 0) return ''
  if (count === 1) return '1 danışan seçildi'
  return `${count} danışan seçildi`
}
