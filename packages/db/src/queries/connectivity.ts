import { sql } from 'drizzle-orm'
import type { Database } from '../client'

/**
 * Veritabanına gerçek bir gidiş-dönüş yapar. Masaüstü uygulamasındaki Next.js
 * sunucusu yerelde çalıştığı için yalnızca aynı origin'e erişebilmek internet
 * bağlantısının veya Neon erişiminin sağlıklı olduğunu kanıtlamaz.
 */
export async function checkDatabaseConnectivity(db: Database): Promise<void> {
  await db.execute(sql`select 1`)
}
