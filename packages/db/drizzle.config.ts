import { defineConfig } from 'drizzle-kit'

// `pnpm --filter @ogun/db db:migrate` bu paketi (packages/db) çalışma
// dizini olarak kullanır — kök .env dosyasını KENDİLİĞİNDEN görmez. Node
// 20.6+'ın yerleşik loadEnvFile'ı ile kök .env'i açıkça yüklüyoruz (yeni
// bir bağımlılık — dotenv vb. — eklemeden). Dosya yoksa (ör. CI'da
// DATABASE_URL zaten ortam değişkeni olarak set edilmişse) sessizce
// devam eder; process.env'de ZATEN set olan değişkenler EZİLMEZ (Node'un
// loadEnvFile davranışı).
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url))
} catch {
  // kök .env yoksa (CI, Docker, vb.) sorun değil — DATABASE_URL başka bir
  // yoldan (gerçek ortam değişkeni) gelmiş olabilir, aşağıdaki kontrol
  // yine de eksikse hata verir.
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
})
