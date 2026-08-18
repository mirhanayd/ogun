import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGoogleSignInRedirects, isNativeShell, saveFileNatively } from './native-shell'

// GitHub issue #52 / Prompt 9.2 — bu modülün SAF (Tauri çalışma zamanı
// gerektirmeyen) kısmının birim testi. vitest.config.ts'te
// `environment: 'node'` kullanıldığından (jsdom YOK) `window` global'i
// varsayılan olarak tanımsızdır — isNativeShell()'in "web" dalını zaten
// bu şekilde test ediyoruz; "native" dalı için `window.__TAURI_INTERNALS__`
// varlığını simüle etmek üzere globalThis.window'u geçici olarak stub'lıyoruz.
describe('isNativeShell / getGoogleSignInRedirects', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('window tanımsızken (SSR / test ortamı) native SAYILMAZ', () => {
    expect(isNativeShell()).toBe(false)
  })

  it('window var ama __TAURI_INTERNALS__ yoksa (düz tarayıcı) native SAYILMAZ', () => {
    vi.stubGlobal('window', {})
    expect(isNativeShell()).toBe(false)
  })

  it('window.__TAURI_INTERNALS__ mevcutsa native SAYILIR', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    expect(isNativeShell()).toBe(true)
  })

  it('web bağlamında Google girişi /kurulum ve /giris\'e yönlenir (mevcut e-posta+şifre akışıyla PARALEL)', () => {
    expect(getGoogleSignInRedirects()).toEqual({
      callbackURL: '/kurulum',
      errorCallbackURL: '/giris',
    })
  })

  it('native kabukta Google girişi köprü route\'una yönlenir (deep link buradan üretilir)', () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    expect(getGoogleSignInRedirects()).toEqual({
      callbackURL: '/api/auth/native/callback',
      errorCallbackURL: '/api/auth/native/callback',
    })
  })

  // GitHub issue #53 / Prompt 9.3, GÖREV 4 — `saveFileNatively`'nin
  // Tauri çalışma zamanı GEREKTİRMEYEN tek dalı: web bağlamında hiçbir
  // eklenti import ETMEDEN erkenden `false` döner (bkz. dosya başı notu:
  // gerçek dosya yazma dalı test ortamında ÇALIŞTIRILAMAZ, @tauri-apps/
  // plugin-dialog/-fs bir Tauri köprüsü gerektirir).
  it('web bağlamında saveFileNatively hiçbir şey yapmadan false döner', async () => {
    const blob = new Blob(['test'], { type: 'application/pdf' })
    await expect(saveFileNatively(blob, 'test.pdf')).resolves.toBe(false)
  })
})
