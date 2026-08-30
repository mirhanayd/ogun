import { visibleNavItems } from '@/app/(app)/_components/nav-items'
import type { ClinicRole } from '@/data/repositories'

export type DesktopRouteMatch =
  | { kind: 'panel' }
  | { kind: 'clients' }
  | { kind: 'client_new' }
  | { kind: 'client_detail'; clientId: string }
  | { kind: 'plan_editor'; clientId: string; planId: string }
  | { kind: 'appointments' }
  | { kind: 'plans' }
  | { kind: 'foods' }
  | { kind: 'finance'; month?: string }
  | { kind: 'settings' }
  | { kind: 'not_found' }

export function routePath(route: string) { return route.split('?')[0] || '/panel' }

export function resolveDesktopRoute(route: string): DesktopRouteMatch {
  const path = routePath(route)
  const plan = path.match(/^\/danisanlar\/([^/]+)\/planlar\/([^/]+)$/)
  if (plan) return { kind: 'plan_editor', clientId: plan[1]!, planId: plan[2]! }
  const client = path.match(/^\/danisanlar\/([^/]+)$/)
  if (client?.[1] === 'yeni') return { kind: 'client_new' }
  if (client) return { kind: 'client_detail', clientId: client[1]! }
  if (path === '/panel') return { kind: 'panel' }
  if (path === '/danisanlar') return { kind: 'clients' }
  if (path === '/randevular') return { kind: 'appointments' }
  if (path === '/planlar') return { kind: 'plans' }
  if (path === '/tarifler') return { kind: 'foods' }
  if (path === '/finans') return { kind: 'finance', month: new URLSearchParams(route.split('?')[1] ?? '').get('month') ?? undefined }
  if (path === '/ayarlar' || path.startsWith('/ayarlar/')) return { kind: 'settings' }
  return { kind: 'not_found' }
}

export function unresolvedVisibleRoutes(role: ClinicRole): string[] {
  return visibleNavItems(role).map((item) => item.href).filter((href) => resolveDesktopRoute(href).kind === 'not_found')
}
