'use client'

import { useEffect, useState } from 'react'
import { Search, User } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { searchClientsAction, type ClientPickerOption } from './actions'

// GitHub issue #39 / Prompt 7.1, GÖREV 3 — "Danışan seç (komut paletiyle
// hızlı arama)". Global CommandPalette (_components/command-palette.tsx)
// içine gömülmek yerine BİLEREK ayrı, küçük bir bileşen: randevu formu bir
// Dialog İÇİNDE açılıyor ve global paleti (Ctrl+K) randevu formunun ÜZERİNDE
// AÇMAK iki iç içe CommandDialog'a (radix Dialog'un modal stack'iyle
// çakışabilecek bir durum) yol açardı. Arama mantığı YİNE DE tekrarlanmıyor
// — ikisi de searchClientsAction (actions.ts) üzerinden AYNI listClients
// sorgusunu çağırıyor, cmdk'nın kendi CommandInput/CommandList/CommandItem
// primitiflerini kullanıyor (bkz. command-palette.tsx'teki AYNI primitifler).
export function ClientPicker({
  value,
  onSelect,
}: {
  value: ClientPickerOption | null
  onSelect: (client: ClientPickerOption) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientPickerOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (query.trim() === '') {
      setResults([])
      return
    }
    setLoading(true)
    const timeout = setTimeout(() => {
      searchClientsAction(query)
        .then(setResults)
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timeout)
  }, [query])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="w-full justify-start gap-2 font-normal"
      >
        <User className="size-4 text-muted-foreground" />
        {value ? `${value.firstName} ${value.lastName}` : 'Danışan seç…'}
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Danışan seç"
        description="Randevu için danışan arayın."
      >
        <CommandInput placeholder="Ad, soyad veya telefon…" value={query} onValueChange={setQuery} />
        <CommandList>
          {query.trim() === '' && (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
              <Search className="size-4" />
              Aramaya başlamak için yazın.
            </div>
          )}
          {query.trim() !== '' && !loading && (
            <CommandEmpty>Danışan bulunamadı.</CommandEmpty>
          )}
          <CommandGroup heading="Danışanlar">
            {results.map((client) => (
              <CommandItem
                key={client.id}
                onSelect={() => {
                  onSelect(client)
                  setOpen(false)
                  setQuery('')
                }}
              >
                <User className="size-4" />
                {client.firstName} {client.lastName}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
