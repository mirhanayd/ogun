'use client'

import { useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, ImagePlus, Loader2, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  applyClinicBrandingVariables,
  isValidBrandColor,
  readableBrandForeground,
  resolveBrandColor,
} from '@/lib/clinic-branding'
import { MAX_LOGO_BYTES } from '@/lib/validation/onboarding-schemas'
import {
  clinicIdentitySchema,
  type ClinicIdentityFormValues,
} from '@/lib/validation/clinic-identity-schemas'
import { updateClinicIdentityAction } from './clinic-identity-actions'

interface ClinicIdentity {
  name: string
  logoUrl: string | null
  primaryColor: string | null
  phone: string | null
  address: string | null
  taxId: string | null
}

function toFormValues(identity: ClinicIdentity): ClinicIdentityFormValues {
  return {
    name: identity.name,
    logoUrl: identity.logoUrl ?? '',
    primaryColor: identity.primaryColor ?? '',
    phone: identity.phone ?? '',
    address: identity.address ?? '',
    taxId: identity.taxId ?? '',
  }
}

export function ClinicIdentityEditor({
  identity,
  canEdit,
}: {
  identity: ClinicIdentity
  canEdit: boolean
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const persistedBrandColorRef = useRef(identity.primaryColor)
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ClinicIdentityFormValues>({
    resolver: zodResolver(clinicIdentitySchema),
    defaultValues: toFormValues(identity),
  })
  const logoUrl = watch('logoUrl')
  const primaryColor = watch('primaryColor')
  const previewColor =
    primaryColor === '' || isValidBrandColor(primaryColor)
      ? resolveBrandColor(primaryColor)
      : resolveBrandColor(persistedBrandColorRef.current)
  const previewForeground = readableBrandForeground(previewColor)

  useEffect(() => {
    const brandingRoot = document.querySelector<HTMLElement>('[data-clinic-branding]')
    if (!brandingRoot) return
    applyClinicBrandingVariables(
      brandingRoot.style,
      primaryColor === '' || isValidBrandColor(primaryColor)
        ? primaryColor
        : persistedBrandColorRef.current,
    )
  }, [primaryColor])

  useEffect(() => {
    return () => {
      const brandingRoot = document.querySelector<HTMLElement>('[data-clinic-branding]')
      if (brandingRoot) {
        applyClinicBrandingVariables(brandingRoot.style, persistedBrandColorRef.current)
      }
    }
  }, [])

  function resetForm() {
    reset(toFormValues(identity))
    setFormError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function onLogoSelected(file: File | undefined) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setFormError('Logo PNG, JPEG, WebP veya SVG biçiminde olmalıdır.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setFormError('Logo dosyası çok büyük (maksimum 500 KB).')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setValue('logoUrl', String(reader.result), { shouldDirty: true, shouldValidate: true })
      setFormError(null)
    }
    reader.onerror = () => setFormError('Logo dosyası okunamadı.')
    reader.readAsDataURL(file)
  }

  async function onSubmit(values: ClinicIdentityFormValues) {
    setFormError(null)
    const result = await updateClinicIdentityAction(values)
    if (!result.success || !result.identity) {
      const brandingRoot = document.querySelector<HTMLElement>('[data-clinic-branding]')
      if (brandingRoot) {
        applyClinicBrandingVariables(brandingRoot.style, persistedBrandColorRef.current)
      }
      setFormError(result.error ?? 'Klinik kimliği güncellenemedi.')
      return
    }
    persistedBrandColorRef.current = result.identity.primaryColor
    const brandingRoot = document.querySelector<HTMLElement>('[data-clinic-branding]')
    if (brandingRoot) applyClinicBrandingVariables(brandingRoot.style, result.identity.primaryColor)
    reset(toFormValues(result.identity))
    if (fileInputRef.current) fileInputRef.current.value = ''
    toast.success('Klinik kimliği güncellendi.')
    router.refresh()
  }

  return (
    <Card className="border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
      <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/9 text-primary ring-1 ring-primary/12">
            <Building2 className="size-4.5" />
          </span>
          <div>
            <CardTitle className="tracking-tight">Klinik kimliği</CardTitle>
            <CardDescription className="mt-1">
              Danışan iletişiminde ve klinik belgelerinde kullanılan bilgiler
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5">
          {!canEdit && (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Klinik kimliğini yalnız klinik sahibi düzenleyebilir.
            </p>
          )}

          <div
            className="flex min-h-20 items-center gap-3 rounded-xl border border-current/15 px-4 py-3 transition-colors"
            style={{ backgroundColor: previewColor, color: previewForeground }}
            aria-label="Marka rengi önizlemesi"
          >
            <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-current/20 bg-white/10">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo data URI veya mevcut HTTPS URL olabilir.
                <img src={logoUrl} alt="" className="size-full object-contain" />
              ) : (
                <Building2 className="size-5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{watch('name') || 'Klinik adı'}</p>
              <p className="text-xs opacity-80">Web uygulaması marka önizlemesi</p>
            </div>
          </div>

          <fieldset disabled={!canEdit || isSubmitting} className="grid gap-5 disabled:opacity-70">
            <div className="grid gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
              <div className="grid content-start gap-2">
                <div className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-muted/45 shadow-inner">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo data URI veya mevcut HTTPS URL olabilir.
                    <img
                      src={logoUrl}
                      alt="Klinik logosu önizlemesi"
                      className="size-full object-contain"
                    />
                  ) : (
                    <Building2 className="size-8 text-muted-foreground" />
                  )}
                </div>
                <input type="hidden" {...register('logoUrl')} />
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="sr-only"
                  aria-label="Klinik logosu dosyası"
                  onChange={(event) => onLogoSelected(event.target.files?.[0])}
                />
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="size-3.5" />
                    Seç
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Logoyu kaldır"
                      onClick={() =>
                        setValue('logoUrl', '', { shouldDirty: true, shouldValidate: true })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
                {errors.logoUrl && <FieldError>{errors.logoUrl.message}</FieldError>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Klinik adı"
                  htmlFor="clinic-name"
                  error={errors.name?.message}
                  className="sm:col-span-2"
                >
                  <Input id="clinic-name" autoComplete="organization" {...register('name')} />
                </Field>
                <Field label="Telefon" htmlFor="clinic-phone" error={errors.phone?.message}>
                  <Input id="clinic-phone" type="tel" autoComplete="tel" {...register('phone')} />
                </Field>
                <Field
                  label="Vergi / kurum numarası"
                  htmlFor="clinic-tax-id"
                  error={errors.taxId?.message}
                >
                  <Input id="clinic-tax-id" inputMode="numeric" {...register('taxId')} />
                </Field>
                <Field
                  label="Marka rengi"
                  htmlFor="clinic-primary-color"
                  error={errors.primaryColor?.message}
                >
                  <Controller
                    control={control}
                    name="primaryColor"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={resolveBrandColor(field.value)}
                          onChange={(event) => field.onChange(event.target.value)}
                          aria-label="Marka rengini seç"
                          className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
                        />
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          id="clinic-primary-color"
                          placeholder="#1B7A5A"
                          autoComplete="off"
                        />
                      </div>
                    )}
                  />
                </Field>
                <Field
                  label="Adres"
                  htmlFor="clinic-address"
                  error={errors.address?.message}
                  className="sm:col-span-2"
                >
                  <Textarea
                    id="clinic-address"
                    rows={3}
                    autoComplete="street-address"
                    {...register('address')}
                  />
                </Field>
              </div>
            </div>
          </fieldset>

          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}

          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                disabled={!isDirty || isSubmitting}
              >
                <RotateCcw className="size-4" />
                Vazgeç
              </Button>
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Değişiklikleri kaydet
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-destructive">{children}</p>
}
