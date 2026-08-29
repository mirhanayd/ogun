import { z } from 'zod'
import { MAX_LOGO_BYTES } from './onboarding-schemas'

const hexColorPattern = /^#[0-9a-fA-F]{6}$/
const logoDataUrlPattern = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=\s]+$/

function isAllowedLogoValue(value: string): boolean {
  if (value === '' || logoDataUrlPattern.test(value)) return true
  try {
    return value.length <= 2048 && new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export const clinicIdentitySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Klinik adı en az 2 karakter olmalıdır.')
    .max(120, 'Klinik adı en fazla 120 karakter olabilir.'),
  phone: z.string().trim().max(30, 'Telefon numarası çok uzun.').optional().or(z.literal('')),
  address: z.string().trim().max(500, 'Adres çok uzun.').optional().or(z.literal('')),
  taxId: z.string().trim().max(50, 'Vergi/kurum numarası çok uzun.').optional().or(z.literal('')),
  logoUrl: z
    .string()
    .refine(
      isAllowedLogoValue,
      'Logo PNG, JPEG, WebP veya SVG biçiminde geçerli bir görsel olmalıdır.',
    )
    .refine(
      (value) => !value.startsWith('data:') || value.length <= MAX_LOGO_BYTES * 1.4,
      'Logo dosyası çok büyük (maksimum 500 KB).',
    )
    .optional()
    .or(z.literal('')),
  primaryColor: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || hexColorPattern.test(value),
      'Renk #RRGGBB biçiminde olmalıdır.',
    ),
})

export type ClinicIdentityFormValues = z.infer<typeof clinicIdentitySchema>

export function normalizeClinicIdentity(values: ClinicIdentityFormValues) {
  return {
    name: values.name.trim(),
    phone: values.phone?.trim() || null,
    address: values.address?.trim() || null,
    taxId: values.taxId?.trim() || null,
    logoUrl: values.logoUrl || null,
    primaryColor: values.primaryColor ? values.primaryColor.toLowerCase() : null,
  }
}
