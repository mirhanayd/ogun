'use client'

import { authClient } from '@/lib/auth-client'

export function SignOutButton() {
  return (
    <button
      className="signout"
      type="button"
      onClick={async () => {
        await authClient.signOut()
        window.location.assign('/giris')
      }}
    >
      Çıkış yap
    </button>
  )
}
