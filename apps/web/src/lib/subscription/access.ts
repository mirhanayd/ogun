import type { SubscriptionStatus } from '@ogun/db/schema'

/**
 * Plan zorunluluğu devreye alınmadan önce açılmış deneme hesaplarını kilitleme.
 * Yeni akışta plan seçimi bulunan hesap ödeme tamamlanana kadar uygulamaya giremez.
 */
export function requiresSubscriptionPayment(
  status: SubscriptionStatus,
  hasPlanSelection: boolean,
): boolean {
  if (status === 'active') return false
  if (status === 'trialing' && !hasPlanSelection) return false
  return true
}
