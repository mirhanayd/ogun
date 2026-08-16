'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ALLERGEN_SEVERITY_OPTIONS,
  type AllergenEntryFormValues,
} from '@/lib/validation/anamnesis-schemas'

// Besin alerjisi/intoleransı — yapılandırılmış giriş (GitHub issue #19 /
// Prompt 4.3, GÖREV 1). Serbest metin bir textarea DEĞİL BİLEREK: her kayıt
// ayrı bir öğe (id + label + şiddet + not) olarak tutulur ki plan editörü
// (gelecekteki issue) bunları TEK TEK besin adlarıyla eşleştirip kırmızı
// işaretleyebilsin — bkz. schema/clients.ts ClientAllergenEntry üstündeki not.
export function AllergenListField({
  label,
  value,
  onChange,
}: {
  label: string
  value: AllergenEntryFormValues[]
  onChange: (next: AllergenEntryFormValues[]) => void
}) {
  const [draftLabel, setDraftLabel] = useState('')
  const [draftSeverity, setDraftSeverity] = useState<'hafif' | 'orta' | 'şiddetli' | ''>('')

  function addEntry() {
    const trimmed = draftLabel.trim()
    if (!trimmed) return
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        label: trimmed,
        severity: draftSeverity === '' ? null : draftSeverity,
        note: null,
      },
    ])
    setDraftLabel('')
    setDraftSeverity('')
  }

  function removeEntry(id: string) {
    onChange(value.filter((entry) => entry.id !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {value.length === 0 && <p className="text-sm text-muted-foreground">Henüz kayıt eklenmedi.</p>}
        {value.map((entry) => (
          <Badge key={entry.id} variant="outline" className="gap-1.5 py-1 pr-1">
            {entry.label}
            {entry.severity && <span className="text-muted-foreground">· {entry.severity}</span>}
            <button
              type="button"
              onClick={() => removeEntry(entry.id)}
              aria-label={`${entry.label} kaydını sil`}
              className="rounded-full p-0.5 hover:bg-muted"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Besin adı (ör. fıstık)"
          value={draftLabel}
          onChange={(event) => setDraftLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addEntry()
            }
          }}
          className="w-52"
        />
        <Select value={draftSeverity} onValueChange={(v) => setDraftSeverity(v as typeof draftSeverity)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Şiddet" />
          </SelectTrigger>
          <SelectContent>
            {ALLERGEN_SEVERITY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          Ekle
        </Button>
      </div>
    </div>
  )
}
