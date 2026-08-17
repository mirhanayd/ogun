'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { smsTemplateSettingSchema, type SmsTemplateSettingFormValues } from '@/lib/validation/subscription-schemas'
import { SMS_TEMPLATE_PLACEHOLDERS } from '@/lib/sms/reminder-template'
import { updateSmsTemplateAction } from './actions'

// GitHub issue #41 / Prompt 7.3, GÖREV 3 — .../paylasim/whatsapp-template-form.tsx
// ile AYNI react-hook-form + zodResolver deseni.
export function SmsTemplateForm({ defaultValues }: { defaultValues: SmsTemplateSettingFormValues }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SmsTemplateSettingFormValues>({
    resolver: zodResolver(smsTemplateSettingSchema),
    defaultValues,
  })

  async function onSubmit(values: SmsTemplateSettingFormValues) {
    setFormError(null)
    setSaved(false)
    const result = await updateSmsTemplateAction(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    setSaved(true)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="smsReminderTemplate">SMS hatırlatma şablonu</Label>
        <Textarea
          id="smsReminderTemplate"
          rows={3}
          placeholder="Sayın {danisanAdi}, {klinikAdi} randevunuz {tarih} tarihinde saat {saat}'de."
          aria-invalid={!!errors.smsReminderTemplate}
          {...register('smsReminderTemplate')}
        />
        {errors.smsReminderTemplate && (
          <p className="text-sm text-destructive">{errors.smsReminderTemplate.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Kullanılabilir yer tutucular: {SMS_TEMPLATE_PLACEHOLDERS.join(', ')}. Boş bırakılırsa varsayılan şablon
          kullanılır. SMS kısa mesaj olduğu için şablonu kısa tutmanız önerilir.
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
