import { CalendarDays, ClipboardList, LayoutDashboard, Settings, UtensilsCrossed, Users, type LucideIcon } from 'lucide-react'
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
  // requiredRole PoC'u: gerçek bir faturalama modülü henüz yok (bkz. Prompt
  // 3.x sonrası yol haritası). "assistant finans göremez" kuralının asıl
  // uygulanacağı yer, ileride eklenecek AYRI bir "Faturalama" menü öğesi
  // olacak. Şimdilik mekanizmayı kanıtlamak için Ayarlar'a uygulandı —
  // klinik ayarları sayfası ileride abonelik/faturalama bilgisini de
  // (clinics.subscriptionStatus) içerecek.
  { href: '/ayarlar', label: 'Ayarlar', icon: Settings, requiredRole: ['owner', 'dietitian'] },
]

export function visibleNavItems(role: ClinicMemberRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.requiredRole || item.requiredRole.includes(role))
}
