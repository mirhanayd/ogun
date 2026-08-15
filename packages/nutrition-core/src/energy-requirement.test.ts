import { describe, expect, it } from 'vitest'
import { calculateBmr, calculateDailyEnergyRequirement, type EnergyProfile } from './energy-requirement'

describe('calculateBmr', () => {
  it('erkek için Mifflin-St Jeor formülünü uygular (+5)', () => {
    // 30 yaş, 80kg, 180cm erkek: 10*80 + 6.25*180 - 5*30 + 5 = 800+1125-150+5 = 1780
    const profile: EnergyProfile = { sex: 'male', age: 30, weightKg: 80, heightCm: 180, activityLevel: 'sedentary' }
    expect(calculateBmr(profile)).toBeCloseTo(1780)
  })

  it('kadın için Mifflin-St Jeor formülünü uygular (-161)', () => {
    // 30 yaş, 60kg, 165cm kadın: 10*60 + 6.25*165 - 5*30 - 161 = 600+1031.25-150-161 = 1320.25
    const profile: EnergyProfile = { sex: 'female', age: 30, weightKg: 60, heightCm: 165, activityLevel: 'sedentary' }
    expect(calculateBmr(profile)).toBeCloseTo(1320.25)
  })
})

describe('calculateDailyEnergyRequirement', () => {
  it('BMR × aktivite faktörünü hesaplar', () => {
    const profile: EnergyProfile = { sex: 'male', age: 30, weightKg: 80, heightCm: 180, activityLevel: 'moderate' }
    // BMR = 1780, moderate faktör = 1.55
    expect(calculateDailyEnergyRequirement(profile)).toBeCloseTo(1780 * 1.55)
  })

  it('aktivite düzeyi arttıkça enerji ihtiyacı artar', () => {
    const base: Omit<EnergyProfile, 'activityLevel'> = { sex: 'male', age: 30, weightKg: 80, heightCm: 180 }
    const sedentary = calculateDailyEnergyRequirement({ ...base, activityLevel: 'sedentary' })
    const active = calculateDailyEnergyRequirement({ ...base, activityLevel: 'very_active' })
    expect(active).toBeGreaterThan(sedentary)
  })
})
