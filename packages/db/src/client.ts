import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

declare global {
  // eslint-disable-next-line no-var
  var __ogunDbClient: ReturnType<typeof postgres> | undefined
}

// GitHub issue #46 / Prompt 8.2, GÖREV 2 — "Neon (Frankfurt), bağlantı
// havuzu farkındalığı." Neon'un serverless/uzun-yaşamayan istemciler için
// önerdiği yaklaşım, DATABASE_URL'de "-pooler" son ekli PgBouncer uç
// noktasını kullanmaktır (bkz. docs/deployment.md "Neon kurulumu") — bu
// TAMAMEN bağlantı DİZESİ (connection string) seviyesinde bir seçimdir, kod
// tarafında ayrıca bir şey YAPILMAZ (postgres.js, verdiğimiz URL'ye düz TCP
// ile bağlanır; havuzlama Neon'un PgBouncer'ı VEYA aşağıdaki `max` ile
// kendi tarafımızda olur).
//
// Kendi tarafımızdaki havuz büyüklüğü DATABASE_POOL_MAX ile
// yapılandırılabilir (opsiyonel — boşsa postgres.js'in varsayılanı: 10).
// Docker/VPS'te tek uzun ömürlü Node process'i için varsayılan yeterlidir;
// Neon pooler'ı arkasında birden fazla instance/yatay ölçekleme varsa bu
// değeri düşürmek (ör. instance başına 5) PgBouncer'ın kendi bağlantı
// limitini aşmamak için önerilir (bkz. docs/deployment.md).
//
// `ssl: 'prefer'` — sunucu TLS destekliyorsa (Neon HER ZAMAN destekler)
// otomatik TLS ile bağlanır; desteklemiyorsa (yerel docker-compose.yml
// Postgres'i, TLS yapılandırılmamış) sessizce düz bağlantıya düşer. Bu,
// Neon bağlantı dizesini sslmode PARAMETRESİ OLMADAN kopyalayan bir
// operatörün (insan hatası) yine de şifresiz bağlanmasını ÖNLER, ama
// yerel/self-hosted Postgres'i (TLS kurulmamışsa) BOZMAZ.
// `tsx src/seed/index.ts` ve packages/etl'deki importer'lar (db:seed,
// etl:bls, etl:usda) bu modülü düz bir Node process'inde çalıştırır — kök
// .env dosyasını KENDİLİĞİNDEN görmezler (apps/web'de sorun değil, Next.js
// zaten kendi .env yüklemesini yapıyor ve DATABASE_URL o zamana kadar
// ZATEN set, aşağıdaki çağrı orada no-op olur). Node 20.6+'ın yerleşik
// loadEnvFile'ı ile kök .env'i açıkça yükler — dosya yoksa (üretimde
// platformun kendisi ortam değişkeni enjekte ediyorsa) sessizce geçilir.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url))
} catch {
  // kök .env yoksa sorun değil — DATABASE_URL zaten set olabilir, aşağıdaki
  // kontrol yine de eksikse hata verir.
}

function createConnection() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set')
  }
  const poolMax = process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : undefined
  return postgres(databaseUrl, {
    ssl: 'prefer',
    ...(poolMax && Number.isFinite(poolMax) && poolMax > 0 ? { max: poolMax } : {}),
  })
}

const client = globalThis.__ogunDbClient ?? createConnection()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__ogunDbClient = client
}

export const db = drizzle(client, { schema })
export type Database = typeof db
