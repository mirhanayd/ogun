'use client'

import { useEffect } from 'react'
import { initFoodIndex } from '@/lib/food-index'

// Kullanıcı plan editörüne ulaşmadan hafif arama kataloğunu hazırlar. Tam
// mikro besin paketi initFoodIndex içinde arka planda sürer ve aramayı kilitlemez.
export function FoodIndexPreloader() {
  useEffect(() => {
    void initFoodIndex().catch((error: unknown) => {
      console.warn('[food-index] ön yükleme tamamlanamadı', error)
    })
  }, [])
  return null
}
