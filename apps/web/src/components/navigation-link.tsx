'use client'

import { createContext, useContext, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'

type Navigate = (href: string) => void
const NavigationContext = createContext<Navigate | null>(null)

export function NavigationProvider({ navigate, children }: { navigate: Navigate; children: ReactNode }) {
  return <NavigationContext.Provider value={navigate}>{children}</NavigationContext.Provider>
}

export function NavigationLink({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const navigate = useContext(NavigationContext)
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (event.defaultPrevented || !navigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(href)
  }
  return <a {...props} href={href} onClick={handleClick} />
}
