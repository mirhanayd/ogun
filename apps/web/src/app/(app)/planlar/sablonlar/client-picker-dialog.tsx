'use client'

import { useEffect, useState } from 'react'
import { User } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { ClientSearchDto } from '@/app/api/clients/search/route'

// GitHub issue #27 / Prompt 5.5, GÖREV 1 — "Bu şablondan plan oluştur →
// danışan seç → düzenlemeye git". apps/web/src/app/(app)/_components/
// command-palette.tsx'teki CommandDialog kullanım deseniyle AYNI (istemci
// tarafı fuzzy filtre yerine sunucudan gelen, ZATEN daraltılmış bir liste
// gösteriliyor — danışan sayısı foods kadar büyük OLMADIĞI için (bkz.
// api/clients/search/route.ts dosya başı notu) bu basit debounce'lu arama
// yeterli).
export function ClientPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (clientId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<ClientSearchDto[]>([])

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      const params = query.trim() === '' ? '' : `?q=${encodeURIComponent(query.trim())}`
      fetch(`/api/clients/search${params}`)
        .then((res) => (res.ok ? (res.json() as Promise<ClientSearchDto[]>) : []))
        .then(setClients)
        .catch(() => setClients([]))
    }, 200)
    return () => clearTimeout(timeout)
  }, [open, query])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Danışan seç"
      description="Bu şablondan plan oluşturmak için bir danışan seçin."
    >
      <CommandInput placeholder="Danışan ara…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Danışan bulunamadı.</CommandEmpty>
        <CommandGroup heading="Danışanlar">
          {clients.map((client) => (
            <CommandItem
              key={client.id}
              onSelect={() => {
                onOpenChange(false)
                onSelect(client.id)
              }}
            >
              <User className="size-4" />
              {client.firstName} {client.lastName}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
