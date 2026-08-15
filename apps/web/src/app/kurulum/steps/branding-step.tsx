'use client'

import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { DEFAULT_PRIMARY_COLOR } from '@/lib/onboarding'
import { MAX_LOGO_BYTES, brandingSchema, type BrandingFormValues } from '@/lib/validation/onboarding-schemas'
import { saveBrandingAction } from '../actions'

export function BrandingStep({
  defaultValues,
  onBack,
  onSaved,
}: {
  defaultValues: BrandingFormValues
  onBack: () => void
  onSaved: () => void
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BrandingFormValues>({
    resolver: zodResolver(brandingSchema),
    defaultValues,
  })

  const logoDataUrl = watch('logoDataUrl')
  const primaryColor = watch('primaryColor') || DEFAULT_PRIMARY_COLOR

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // aynı dosyayı tekrar seçebilmek için input'u sıfırla
    if (!file) return
    setFormError(null)
    if (!file.type.startsWith('image/')) {
      setFormError('Logo bir görsel dosyası olmalıdır (PNG, JPG, SVG…).')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFormError('Logo dosyası çok büyük (maksimum 500 KB).')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setValue('logoDataUrl', reader.result as string, { shouldDirty: true })
    reader.onerror = () => setFormError('Logo okunamadı, lütfen tekrar deneyin.')
    reader.readAsDataURL(file)
  }

  async function onSubmit(values: BrandingFormValues) {
    setFormError(null)
    const result = await saveBrandingAction(values)
    if (!result.success) {
      setFormError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Marka</CardTitle>
          <CardDescription>Logo ve marka renginiz, ileride diyet listesi PDF çıktısında kullanılacak.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted">
                {logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI önizlemesi, next/image optimize edemez
                  <img src={logoDataUrl} alt="Klinik logosu" className="size-full object-contain" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Görsel seç
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <p className="text-xs text-muted-foreground">PNG, JPG veya SVG — maksimum 500 KB.</p>
              </div>
            </div>
            {errors.logoDataUrl && <p className="text-sm text-destructive">{errors.logoDataUrl.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="primaryColor">Marka rengi</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Marka rengi seçici"
                className="size-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
                value={primaryColor}
                onChange={(event) => setValue('primaryColor', event.target.value, { shouldDirty: true })}
              />
              <Input
                id="primaryColor"
                aria-invalid={!!errors.primaryColor}
                className="max-w-32"
                {...register('primaryColor')}
              />
            </div>
            {errors.primaryColor && <p className="text-sm text-destructive">{errors.primaryColor.message}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </CardContent>
        <CardFooter className="justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            Geri
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Kaydediliyor…' : 'Devam et'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
