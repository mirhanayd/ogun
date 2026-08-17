import { CalendarDays, ClipboardList, LayoutDashboard, Settings, UtensilsCrossed, Users, Wallet, type LucideIcon } from 'lucide-react'
import type { ClinicMemberRole } from '@ogun/db/schema'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  // Belirtilmezse tüm roller görür. Belirtilirse, listede OLMAYAN roller bu
  // öğeyi menüde görmez (bkz. sidebar-nav.tsx / bottom-nav.tsx / command-palette.tsx
  // filtreleme mantığı).
  requiredRole?: ClinicMemberRole[]
}

// Kök `/` yolu, uygulama kabuğunun DIŞINDA, herkese açık bir tanıtım/"yakında"
// sayfası için ayrılmış (bkz. apps/web/src/app/page.tsx) — bu yüzden panel
// buraya değil /panel'e taşındı; aksi halde (app)/page.tsx ile app/page.tsx
// aynı yola çözülür ve Next.js derleme hatası verir.
export const NAV_ITEMS: NavItem[] = [
  { href: '/panel', label: 'Panel', icon: LayoutDashboard },
  { href: '/danisanlar', label: 'Danışanlar', icon: Users },
  { href: '/randevular', label: 'Randevular', icon: CalendarDays },
  { href: '/planlar', label: 'Planlar', icon: ClipboardList },
  { href: '/tarifler', label: 'Tarifler', icon: UtensilsCrossed },
  // GitHub issue #40 / Prompt 7.2 — GÖREV 3'ün istediği "sadece owner
  // görebilsin" kuralı: #11'in requiredRole PoC'u (o zaman "gerçek bir
  // faturalama modülü henüz yok" dediği için Ayarlar'a uygulanmıştı) BURADA,
  // asıl hedefine (bir Faturalama/Finans menü öğesi) kavuşuyor — mekanizma
  // AYNEN kullanıldı, yeni bir rol-gating YAZILMADI.
  { href: '/finans', label: 'Finans', icon: Wallet, requiredRole: ['owner'] },
  { href: '/ayarlar', label: 'Ayarlar', icon: Settings, requiredRole: ['owner', 'dietitian'] },
]

export function visibleNavItems(role: ClinicMemberRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.requiredRole || item.requiredRole.includes(role))
}
