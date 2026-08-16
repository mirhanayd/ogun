import { create } from 'zustand'
import type { FoodSearchHit } from '@/lib/food-index'

// GitHub issue #25 / Prompt 5.3 — "aktif öğün" mekanizması.
//
// BAĞLAM: command-palette.tsx (#11/#24) besin arama sonucu seçildiğinde
// şimdiye kadar bir toast+console.log yer tutucusuyla çalışıyordu, çünkü
// "aktif öğün" kavramı plan editörü UI'ı (bu issue) ile birlikte gelecekti.
// Bu store TAM OLARAK o bağlantı noktası:
//
//  1. Plan editöründeki bir öğün bloğu odak aldığında (arama kutusuna
//     tıklandığında, bir kaleme tıklandığında vb.) setActiveMeal(mealId,
//     handler) çağırır — handler, o öğüne GERÇEKTEN bir kalem eklemeyi
//     bilen fonksiyondur (bkz. plan-editor-store.ts addItemFromHit).
//  2. Komut paleti besin sonucu seçildiğinde addFoodToActiveMeal(hit)
//     çağırır. Aktif bir öğün varsa handler'ı çalıştırır (GERÇEK ekleme);
//     yoksa (kullanıcı plan editöründe değilse) false döner, çağıran taraf
//     (command-palette.tsx) eski toast yer tutucusuna düşer.
//
// Store, editör route'undan TAMAMEN bağımsız (apps/web/src/lib/stores
// altında, plan editörüne özel bir dosyada DEĞİL) çünkü command-palette.tsx
// her sayfada mount edilir — editör route'u unmount olduğunda
// clearActiveMeal() çağrılmalı (bkz. plan-editor.tsx useEffect cleanup),
// yoksa palet başka bir sayfadayken bayat bir handler'ı çalıştırmaya
// çalışabilir.
export type ActiveMealFoodHandler = (hit: FoodSearchHit) => void

interface ActiveMealState {
  activeMealId: string | null
  activeMealLabel: string | null
  handler: ActiveMealFoodHandler | null
  setActiveMeal: (mealId: string, label: string, handler: ActiveMealFoodHandler) => void
  clearActiveMeal: (mealId?: string) => void
  addFoodToActiveMeal: (hit: FoodSearchHit) => boolean
}

export const useActiveMealStore = create<ActiveMealState>((set, get) => ({
  activeMealId: null,
  activeMealLabel: null,
  handler: null,

  setActiveMeal: (mealId, label, handler) => {
    set({ activeMealId: mealId, activeMealLabel: label, handler })
  },

  // mealId verilirse, sadece O öğün hâlâ aktifse temizler — bir öğün
  // unmount olurken (blur, DOM'dan kalkma) ARADA başka bir öğün aktif
  // olmuşsa onu YANLIŞLIKLA temizlememek için (bkz. plan-editor.tsx'teki
  // useEffect cleanup sırası garantisi olmayan React davranışı).
  clearActiveMeal: (mealId) => {
    if (mealId !== undefined && get().activeMealId !== mealId) return
    set({ activeMealId: null, activeMealLabel: null, handler: null })
  },

  addFoodToActiveMeal: (hit) => {
    const { handler } = get()
    if (!handler) return false
    handler(hit)
    return true
  },
}))
