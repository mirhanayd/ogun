import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields, oneTimeTokenClient } from 'better-auth/client/plugins'
import type { Auth } from './auth'
import {
  getCachedNativeSessionToken,
  isNativeShell,
  persistNativeSessionToken,
} from './native-shell'

// İstemci tarafı Better Auth istemcisi. inferAdditionalFields<Auth>() sayesinde
// session.activeClinicId ve session.role alanları da tip güvenli olarak gelir.
//
// GitHub issue #52 / Prompt 9.2, GÖREV 1 ve GÖREV 3 — eklenenler:
//
// - oneTimeTokenClient(): authClient.oneTimeToken.verify({ token }) metodunu
//   ekler — native-auth-bridge.tsx bunu ogun://auth/callback deep link'inden
//   gelen kısa ömürlü token'ı GERÇEK bir oturuma çevirmek için kullanır.
//
// - fetchOptions.auth: native kabukta (bkz. native-shell.ts isNativeShell())
//   her isteğe önbellekteki bearer token'ı `Authorization: Bearer ...` olarak
//   ekler VE her başarılı yanıttaki `set-auth-token` başlığını (bkz. auth.ts
//   bearer() eklentisi) yakalayıp Tauri'nin güvenli depolamasına yazar. Web
//   TARAYICISINDA bu iki kanca da NO-OP'tur (isNativeShell() false) —
//   çerez tabanlı oturum AYNEN mevcut haliyle çalışmaya devam eder.
export const authClient = createAuthClient({
  // The packaged desktop server listens on a free loopback port, not the
  // build-time web URL (usually localhost:3000).
  baseURL:
    isNativeShell() && typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [inferAdditionalFields<Auth>(), oneTimeTokenClient()],
  fetchOptions: {
    auth: {
      type: 'Bearer',
      token: () => (isNativeShell() ? getCachedNativeSessionToken() : undefined),
    },
    onSuccess: (ctx) => {
      if (!isNativeShell()) return
      const authToken = ctx.response.headers.get('set-auth-token')
      if (authToken) {
        void persistNativeSessionToken(authToken)
      }
    },
  },
})
