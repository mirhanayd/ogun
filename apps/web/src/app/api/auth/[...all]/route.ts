import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

// Better Auth'un tüm uç noktalarını (sign-in, sign-up, oauth callback, ...)
// bu tek route üzerinden Next.js App Router'a bağlar.
export const { GET, POST } = toNextJsHandler(auth)
