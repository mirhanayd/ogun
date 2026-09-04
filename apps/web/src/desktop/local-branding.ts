import type { DomainEntity } from '@/data/repositories'

export interface LocalClinicIdentity {
  id: string
  name: string
  logoUrl: string | null
  primaryColor: string | null
}

export function clinicIdentityFromEntity(
  clinic: DomainEntity | undefined,
  fallback: { id: string; name: string },
): LocalClinicIdentity {
  return {
    id: typeof clinic?.id === 'string' ? clinic.id : fallback.id,
    name: typeof clinic?.name === 'string' && clinic.name.trim() ? clinic.name : fallback.name,
    logoUrl: typeof clinic?.logoUrl === 'string' && clinic.logoUrl ? clinic.logoUrl : null,
    primaryColor:
      typeof clinic?.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(clinic.primaryColor)
        ? clinic.primaryColor.toLowerCase()
        : null,
  }
}
