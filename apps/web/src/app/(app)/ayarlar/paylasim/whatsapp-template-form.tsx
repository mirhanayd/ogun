'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  whatsappTemplateSettingSchema,
  type WhatsappTemplateSettingFormValues,
} from '@/lib/validation/share-schemas'
import { WHATSAPP_TEMPLATE_PLACEHOLDERS } from '@/lib/share/message-template'
import { updateWhatsappTemplateAction } from './actions'

// GitHub issue #36 / Prompt 6.2, GÖREV 2 — data-retention-form.tsx ile AYNI
// react-hook-form + zodResolver deseni.
export function WhatsappTemplateForm({ defaultValues }: { defaultValues: WhatsappTemplateSettingFormValues }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<WhatsappTemplateSettingFormValues>({
    resolver: zodResolver(whatsappTemplateSettingSchema),
    defaultValues,
  })

  async function onSubmit(values: WhatsappTemplateSettingFormValues) {
    setFormError(null)
    setSaved(false)
    const result = await updateWhatsappTemplateAction(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    setSaved(true)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="whatsappMessageTemplate">Mesaj şablonu</Label>
        <Textarea
          id="whatsappMessageTemplate"
          rows={4}
          placeholder="Merhaba {danisanAdi}, &quot;{planAdi}&quot; adlı beslenme planınız hazır: {link}"
          aria-invalid={!!errors.whatsappMessageTemplate}
          {...register('whatsappMessageTemplate')}
        />
        {errors.whatsappMessageTemplate && (
          <p className="text-sm text-destructive">{errors.whatsappMessageTemplate.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Kullanılabilir yer tutucular: {WHATSAPP_TEMPLATE_PLACEHOLDERS.join(', ')}. Boş bırakılırsa varsayılan
          şablon kullanılır.
        </p>
      </div>
      {formError && <p className="text-sm text-destructive">{formError}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Kaydedildi.</span>}
      </div>
    </form>
  )
}
