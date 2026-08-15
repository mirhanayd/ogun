import { createAuthClient } from 'better-auth/react'
import { customSessionClient } from 'better-auth/client/plugins'
import type { auth } from './auth'

// İstemci tarafı Better Auth örneği. customSessionClient<typeof auth> sayesinde
// useSession() dönüşünde activeClinicId ve role alanları da tip güvenli olur.
// Dönüş tipi açıkça yazılıyor — bkz. auth.ts'teki aynı gerekçe (TS2742).
export const authClient: ReturnType<typeof createAuthClient> = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
})

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } = authClient
