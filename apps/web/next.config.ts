import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import createBundleAnalyzer from '@next/bundle-analyzer'

// GitHub issue #46 / Prompt 8.2, GÖREV 3 — "Dockerfile için standalone
// Next.js çıktısı." `output: 'standalone'`, Next.js'in derlenmiş uygulamayı
// + sadece GERÇEKTEN kullanılan node_modules dosyalarını (bağımlılık ağacı
// izlenerek) `.next/standalone` altına kopyalamasını sağlar — Dockerfile'ın
// son aşaması (bkz. apps/web/Dockerfile) tüm monorepo'yu değil SADECE bu
// klasörü taşır, imaj küçük kalır. Vercel'e özel değil (mimari kural #6);
// Vercel bu bayrağı YOK SAYAR (kendi build çıktısını kullanır), yani
// Docker/VPS ve Vercel yolları AYNI next.config.ts ile çalışır.
const nextConfig: NextConfig = {
  output: 'standalone',
}

// GitHub issue #45 / Prompt 8.1, GÖREV 2 — "Bundle analizi, 200 KB üstü
// chunk'ları tespit et." `pnpm analyze` (ANALYZE=true) ile açılan
// .next/analyze/*.html raporları üretir — kod DEĞİŞMEZ, sadece build
// çıktısını görselleştirir. (bkz. docs/performance.md — bu raporun GERÇEK
// bir üretim build'inden okunan bulguları.)
const withBundleAnalyzer = createBundleAnalyzer({ enabled: process.env.ANALYZE === 'true' })

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — "Sentry (EU bölgesi) kurulumu,
// kaynak haritaları." withSentryConfig SADECE build zamanı kaynak haritası
// yükleme (source map upload) + webpack/turbopack eklentilerini bağlar;
// SENTRY_AUTH_TOKEN tanımlı değilse (bu sandbox'ta böyle) yükleme adımını
// SESSİZCE atlar, build'i BOZMAZ — bkz. .env.example'daki SENTRY_* açıklaması.
// `org`/`project` boş string'ken de aynı şekilde no-op'a düşer.
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Kaynak haritalarını Sentry'ye yükledikten sonra istemciye AÇIK
  // dağıtmayı önler (üretim ölçüsü/güvenliği için standart ayar).
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Build çıktısında Sentry eklenti loglarını sessize alır — DSN/token
  // yoksa zaten atlanan bir adım hakkında gürültü yapılmasın diye.
  silent: true,
  // Next.js'in kendi widening'ini (ör. React bileşen adlarını olay
  // isimlerine ekleme) telemetriyle GÖNDERMEZ — Vercel'e özel olmayan,
  // gizlilik odaklı varsayılan.
  disableLogger: true,
  telemetry: false,
})
