export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export interface EnergyProfile {
  sex: Sex
  age: number
  weightKg: number
  heightCm: number
  activityLevel: ActivityLevel
}

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

// Mifflin-St Jeor formülü: Harris-Benedict'e göre klinik pratikte daha doğru
// kabul edilir.
export function calculateBmr(profile: EnergyProfile): number {
  const base = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age
  return profile.sex === 'male' ? base + 5 : base - 161
}

// BMR × aktivite faktörü (PAL) = günlük toplam enerji ihtiyacı (TDEE).
export function calculateDailyEnergyRequirement(profile: EnergyProfile): number {
  return calculateBmr(profile) * ACTIVITY_MULTIPLIERS[profile.activityLevel]
}
