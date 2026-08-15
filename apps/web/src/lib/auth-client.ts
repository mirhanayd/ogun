import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import type { Auth } from './auth'

// İstemci tarafı Better Auth istemcisi. inferAdditionalFields<Auth>() sayesinde
// session.activeClinicId ve session.role alanları da tip güvenli olarak gelir.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [inferAdditionalFields<Auth>()],
})
