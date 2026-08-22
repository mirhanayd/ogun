import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  exchangeNativeOneTimeToken,
  getGoogleSignInRedirects,
  getNativeGoogleSignInURL,
  isNativeShell,
  saveFileNatively,
} from './native-shell'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({ invoke }))

// GitHub issue #52 / Prompt 9.2 — bu modülün SAF (Tauri çalışma zamanı
// gerektirmeyen) kısmının birim testi. vitest.config.ts'te
// `environment: 'node'` kullanıldığından (jsdom YOK) `window` global'i
// varsayılan olarak tanımsızdır — isNativeShell()'in "web" dalını zaten
// bu şekilde test ediyoruz; "native" dalı için `window.__TAURI_INTERNALS__`
// varlığını simüle etmek üzere globalThis.window'u geçici olarak stub'lıyoruz.
describe('isNativeShell / getGoogleSignInRedirects', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    invoke.mockReset()
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

  it("web bağlamında Google girişi /panel ve /giris'e yönlenir (mevcut e-posta+şifre akışıyla PARALEL)", () => {
    // GitHub issue #67 — hedef /kurulum'dan /panel'e taşındı: giriş yapan
    // kullanıcının kliniği ÇOKTAN olabilir.
    expect(getGoogleSignInRedirects()).toEqual({
      callbackURL: '/panel',
      errorCallbackURL: '/giris',
    })
  })

  it("native kabukta Google girişini sistem tarayıcısındaki başlangıç route'una taşır", () => {
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {},
      location: { origin: 'http://127.0.0.1:51374' },
    })
    expect(getNativeGoogleSignInURL()).toBe('http://127.0.0.1:51374/api/auth/native/google')
  })

  it('OAuth token değişiminde eski bearer göndermeden yeni oturumu kalıcılaştırır', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    invoke.mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        { session: {}, user: {} },
        { headers: { 'set-auth-token': 'new-signed-session' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(exchangeNativeOneTimeToken('short-lived-ott')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/one-time-token/verify',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization')
    expect(invoke).toHaveBeenCalledWith('store_session_token', {
      token: 'new-signed-session',
    })
  })

  it('geçersiz veya süresi dolmuş OAuth tokenını ayırt eder', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 400 })))

    await expect(exchangeNativeOneTimeToken('expired-ott')).resolves.toEqual({
      ok: false,
      reason: 'invalid-or-expired-token',
    })
    expect(invoke).not.toHaveBeenCalled()
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
