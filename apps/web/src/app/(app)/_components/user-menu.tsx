'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Settings } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth-client'
import { clearNativeSessionToken } from '@/lib/native-shell'

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase() || '?'
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)
    await authClient.signOut()
    // GitHub issue #52 / Prompt 9.2, kod incelemesi (PR #56) — native
    // kabukta çerez/oturum burada temizlense bile stronghold'da saklı
    // bearer token'ı SİLMEZSEK, bir sonraki uygulama açılışında
    // native-auth-bridge.tsx o ESKİ token'ı okuyup kullanıcıyı SESSİZCE
    // tekrar oturum açık hale getirirdi — "çıkış yap" native'de gerçekten
    // KALICI olmazdı. Web tarayıcısında no-op (bkz. native-shell.ts).
    await clearNativeSessionToken()
    router.push('/giris')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Kullanıcı menüsü">
          <Avatar size="sm">
            <AvatarFallback>{initialsOf(name)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="truncate text-xs text-muted-foreground">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/ayarlar')}>
          <Settings className="size-4" />
          Ayarlar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={isSigningOut} onSelect={handleSignOut}>
          <LogOut className="size-4" />
          {isSigningOut ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
