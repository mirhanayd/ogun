'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { submitPilotContactAction, type PilotContactResult } from './actions'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 2 — "Pilot fiyatlandırması"
// etiketinin yanındaki iletişim formu.
//
// SADE, KASITLI OLARAK react-hook-form'SUZ: kayıt/giriş formları (bkz.
// app/(auth)/kayit/page.tsx) react-hook-form + zodResolver kullanıyor çünkü
// çok alanlı, anlık doğrulamalı formlar. Bu form beş alan ve tek gönderim —
// bir pazarlama sayfasının ilk yükleme maliyetine (Lighthouse performans
// hedefi 90+) react-hook-form paketini eklemek bu kazanç için orantısız.
// Doğrulama SUNUCUDA zaten zorunlu (actions.ts, aynı zod şeması) ve alan
// bazlı hatalar buraya geri dönüyor — yani "istemcide doğrulama yok" değil,
// "doğrulama tek yerde" durumu.
//
// `<select>`: shadcn Select bir Radix istemci bileşeni ve ekstra JS demek;
// native select hem daha hafif hem klavye/ekran okuyucu desteği zaten tam.
const PLAN_OPTIONS = [
  { value: 'başlangıç', label: 'Başlangıç — tek diyetisyen' },
  { value: 'klinik', label: 'Klinik — 5 kullanıcıya kadar' },
  { value: 'kurumsal', label: 'Kurumsal — sınırsız' },
  { value: 'emin-degilim', label: 'Emin değilim, birlikte bakalım' },
]

export function PilotContactForm() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<PilotContactResult | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    startTransition(async () => {
      const next = await submitPilotContactAction(formData)
      setResult(next)
      if (next.success) form.reset()
    })
  }

  if (result?.success) {
    return (
      <div
        role="status"
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6"
      >
        <p className="text-section">Talebiniz alındı.</p>
        <p className="text-body text-muted-foreground">
          En kısa sürede size dönüş yapacağız. Bu arada uygulamayı indirip hesabınızı açabilirsiniz — pilot
          görüşmesi indirmeyi beklemiyor.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pilot-name">Ad soyad</Label>
          <Input
            id="pilot-name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={result?.fieldErrors?.name ? true : undefined}
            aria-describedby={result?.fieldErrors?.name ? 'pilot-name-error' : undefined}
          />
          {result?.fieldErrors?.name && (
            <p id="pilot-name-error" className="text-helper text-destructive">
              {result.fieldErrors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pilot-email">E-posta</Label>
          <Input
            id="pilot-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            aria-invalid={result?.fieldErrors?.email ? true : undefined}
            aria-describedby={result?.fieldErrors?.email ? 'pilot-email-error' : undefined}
          />
          {result?.fieldErrors?.email && (
            <p id="pilot-email-error" className="text-helper text-destructive">
              {result.fieldErrors.email}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pilot-clinic">Klinik / şehir (isteğe bağlı)</Label>
          <Input id="pilot-clinic" name="clinic" autoComplete="organization" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pilot-plan">İlgilendiğiniz paket</Label>
          <select
            id="pilot-plan"
            name="plan"
            defaultValue="emin-degilim"
            className="h-9 rounded-lg border border-input bg-background px-3 text-body text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pilot-message">Kliniğinizden kısaca bahsedin (isteğe bağlı)</Label>
        <Textarea
          id="pilot-message"
          name="message"
          rows={4}
          placeholder="Kaç diyetisyen çalışıyor, haftada kaç plan hazırlıyorsunuz, şu an hangi yazılımı kullanıyorsunuz?"
        />
      </div>

      {/* Bal küpü — gerçek kullanıcıya görünmez, bot doldurur (bkz. actions.ts). */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="pilot-website">Bu alanı boş bırakın</label>
        <input id="pilot-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {result?.error && (
        <p role="alert" className="text-body text-destructive">
          {result.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? 'Gönderiliyor…' : 'Pilot için başvur'}
        </Button>
        <p className="text-helper text-muted-foreground">
          Yalnızca bu görüşme için kullanılır, pazarlama listesine eklenmezsiniz.
        </p>
      </div>
    </form>
  )
}
