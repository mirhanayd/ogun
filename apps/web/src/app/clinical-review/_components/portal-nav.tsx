'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  ListFilter,
  UserCheck,
  CheckCircle2,
  History,
  Menu,
  X,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface PortalNavProps {
  user: {
    id: string
    name: string
    email: string
  }
  profile: {
    professionalRole: string
    specialty: string | null
    verificationStatus: string
    isActive: boolean
    canPublish: boolean
  } | null
}

const ROLE_LABELS: Record<string, string> = {
  pharmacist: 'Eczacı',
  dietitian: 'Diyetisyen',
  physician: 'Hekim',
  clinical_admin: 'Klinik Yönetici',
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; bg: string }
> = {
  verified: {
    label: 'Doğrulandı',
    variant: 'default',
    bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  },
  pending: {
    label: 'Doğrulama Bekliyor',
    variant: 'secondary',
    bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
  suspended: {
    label: 'Askıya Alındı',
    variant: 'destructive',
    bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
  },
  rejected: {
    label: 'Reddedildi',
    variant: 'destructive',
    bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
  },
}

export function PortalNav({ user, profile }: PortalNavProps) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isClinicalAdmin = profile?.professionalRole === 'clinical_admin'
  const isVerified = profile?.verificationStatus === 'verified' && profile.isActive

  const navItems = [
    { href: '/clinical-review', label: 'Genel Bakış', icon: LayoutDashboard },
    ...(isVerified
      ? [{ href: '/clinical-review/assigned', label: 'Bana Atananlar', icon: UserCheck }]
      : []),
    ...(isVerified && isClinicalAdmin
      ? [{ href: '/clinical-review/queue', label: 'Yönetim Havuzu', icon: ListFilter }]
      : []),
  ]

  const adminNavItems = isClinicalAdmin
    ? [
        { href: '/clinical-review/admin/publish', label: 'Yayınlama Kuyruğu', icon: CheckCircle2 },
        { href: '/clinical-review/admin/audit', label: 'Denetim İzi (Audit)', icon: History },
      ]
    : []

  const statusInfo = profile
    ? (STATUS_CONFIG[profile.verificationStatus] ?? STATUS_CONFIG.pending)
    : null

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Portal Identity */}
          <div className="flex items-center gap-3">
            <Link
              href="/clinical-review"
              className="flex items-center gap-2.5 font-bold tracking-tight text-foreground transition-opacity hover:opacity-90"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold leading-none">OGUN CLINICAL</span>
                <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  Review Portal
                </span>
              </div>
            </Link>

            {/* Desktop Role & Status Badges */}
            {profile && (
              <div className="hidden items-center gap-2 pl-4 md:flex">
                <Badge variant="outline" className="text-xs font-medium">
                  {ROLE_LABELS[profile.professionalRole] ?? profile.professionalRole}
                  {profile.specialty ? ` • ${profile.specialty}` : ''}
                </Badge>
                {statusInfo && (
                  <Badge variant="outline" className={cn('text-xs font-medium', statusInfo.bg)}>
                    {profile.verificationStatus === 'verified' ? (
                      <ShieldCheck className="mr-1 h-3 w-3" />
                    ) : (
                      <ShieldAlert className="mr-1 h-3 w-3" />
                    )}
                    {statusInfo.label}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Desktop Nav Links */}
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}

            {/* Admin Section Divider & Links */}
            {adminNavItems.length > 0 && (
              <>
                <div className="mx-2 h-4 w-px bg-border" />
                {adminNavItems.map((item) => {
                  const active = pathname === item.href
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  )
                })}
              </>
            )}
          </nav>

          {/* User Profile / Exit Link */}
          <div className="flex items-center gap-2">
            <Link
              href="/panel"
              className="hidden items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex"
            >
              <span>Klinik Paneline Dön</span>
              <ExternalLink className="h-3 w-3" />
            </Link>

            {/* Mobile Menu Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menüyü aç/kapat"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="border-b border-border bg-background p-4 md:hidden">
            {profile && (
              <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
                <Badge variant="outline" className="text-xs">
                  {ROLE_LABELS[profile.professionalRole] ?? profile.professionalRole}
                </Badge>
                {statusInfo && (
                  <Badge variant="outline" className={cn('text-xs', statusInfo.bg)}>
                    {statusInfo.label}
                  </Badge>
                )}
                <div className="w-full text-xs text-muted-foreground mt-1">
                  {user.name} ({user.email})
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="px-2 text-xs font-semibold uppercase text-muted-foreground">
                İnceleme
              </span>
              {navItems.map((item) => {
                const active = pathname === item.href
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  </Link>
                )
              })}

              {adminNavItems.length > 0 && (
                <>
                  <span className="mt-3 px-2 text-xs font-semibold uppercase text-muted-foreground">
                    Klinik Yönetici
                  </span>
                  {adminNavItems.map((item) => {
                    const active = pathname === item.href
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          'flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </div>
                        <ChevronRight className="h-4 w-4 opacity-50" />
                      </Link>
                    )
                  })}
                </>
              )}

              <div className="mt-4 border-t border-border pt-3">
                <Link
                  href="/panel"
                  className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>Klinik Paneline Git</span>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Verification Notice Banner */}
      {profile && profile.verificationStatus === 'pending' && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-center text-xs sm:text-sm text-amber-800 dark:text-amber-300">
          <strong>Hakem Doğrulaması Bekleniyor:</strong> Klinik karar (onay/ret) verme ve yayınlama
          yetkileri, profiliniz bir Klinik Yönetici tarafından doğrulandıktan sonra aktifleşecektir.
          Doğrulama tamamlanana kadar görev ve klinik aday içeriğine erişemezsiniz.
        </div>
      )}

      {profile && profile.verificationStatus === 'suspended' && (
        <div className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-center text-xs sm:text-sm text-rose-800 dark:text-rose-300">
          <strong>Hesap Askıya Alındı:</strong> Klinik inceleme yetkileriniz geçici olarak askıya
          alınmıştır. Lütfen sistem yöneticisiyle iletişime geçin.
        </div>
      )}
    </>
  )
}
