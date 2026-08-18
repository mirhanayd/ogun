'use server'

import { getPanelNotificationFeed } from './queries'
import type { NotificationFeed } from '@/lib/notifications/summary'

// GitHub issue #53 / Prompt 9.3, GÖREV 3 — native-notification-bridge.tsx
// (bir istemci bileşeni) `getPanelNotificationFeed`'i (bkz. queries.ts)
// DOĞRUDAN çağıramaz: o dosya `import 'server-only'` ile işaretli, bir
// Server Action DEĞİL — sadece panel/page.tsx gibi (bir Server Component)
// sunucu-taraflı çağıranlar içindir. Bu ince `'use server'` sarmalayıcı,
// panel sayfasının KULLANDIĞI AYNI sorgu/withAuth/withAudit zincirini
// (iş mantığını hiç TEKRARLAMADAN) istemci tarafına bir Server Action
// olarak açıyor — native bildirim köprüsünün periyodik olarak okuyabilmesi
// için gereken TEK ek yüzey bu.
export async function getPanelNotificationFeedAction(): Promise<NotificationFeed> {
  return getPanelNotificationFeed()
}
