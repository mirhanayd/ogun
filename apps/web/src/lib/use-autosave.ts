'use client'

import { useEffect, useRef, useState } from 'react'

// Genel amaçlı otomatik kaydet hook'u — GitHub issue #19 / Prompt 4.3,
// GÖREV 1: "Otomatik kaydet (debounce 800ms), 'kaydedildi' göstergesi."
// Herhangi bir react-hook-form watch() değerine bağlanabilecek şekilde
// generic tutuldu; sadece anamnez formu DEĞİL, ileride başka autosave'li
// formlar (ör. plan editörü, roadmap Prompt 5.3) da bu hook'u
// kullanabilir.
export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface AutosaveResult {
  success: boolean
  error?: string
}

export function useAutosave<T>(
  value: T,
  save: (value: T) => Promise<AutosaveResult>,
  options: { debounceMs?: number; enabled?: boolean } = {},
): { status: AutosaveStatus; error: string | null } {
  const debounceMs = options.debounceMs ?? 800
  const enabled = options.enabled ?? true

  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // İlk render'da (sayfa yüklenip formun defaultValues'u set edildiğinde)
  // autosave TETİKLENMEMELİ — kullanıcı henüz hiçbir şey değiştirmedi.
  const isFirstRun = useRef(true)
  const latestValueRef = useRef(value)
  const saveRef = useRef(save)
  saveRef.current = save
  latestValueRef.current = value

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    if (!enabled) return

    setStatus('saving')
    const timeoutId = setTimeout(() => {
      void (async () => {
        const result = await saveRef.current(latestValueRef.current)
        if (result.success) {
          setStatus('saved')
          setError(null)
        } else {
          setStatus('error')
          setError(result.error ?? 'Kaydedilemedi, lütfen tekrar deneyin.')
        }
      })()
    }, debounceMs)

    return () => clearTimeout(timeoutId)
    // value'nun JSON kimliği (watch() nesnesi) bu hook'un TEK kasıtlı
    // tetikleyicisi olmalı; debounceMs/enabled/save değişimi yeniden autosave
    // TETİKLEMEMELİ (saveRef/enabled kapanışta zaten güncel okunuyor) —
    // exhaustive-deps'in önerdiği ek bağımlılıklar bu kasıtlı seçimi bozar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)])

  return { status, error }
}
