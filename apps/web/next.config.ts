import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import createBundleAnalyzer from '@next/bundle-analyzer'

// Next.js normalde yalnızca apps/web altındaki .env* dosyalarını yükler;
// monorepo'nun kanonik yerel ayarları ise kök .env'dedir. Özellikle
// apps/web/.env.local içindeki boş Google alanları, kökteki gerçek OAuth
// değerlerini gölgeleyebiliyordu. Platform tarafından verilen dolu değerleri
// asla ezmeden, yalnızca eksik/boş Google ayarlarında kök .env'e düş.
for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const) {
  if (!process.env[key]?.trim()) delete process.env[key]
}

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url))
} catch {
  // CI/production ortamında kök .env bulunmayabilir; değerler platformdan gelir.
}

// GitHub issue #46 / Prompt 8.2, GÖREV 3 — "Dockerfile için standalone
// Next.js çıktısı." `output: 'standalone'`, Next.js'in derlenmiş uygulamayı
// + sadece GERÇEKTEN kullanılan node_modules dosyalarını (bağımlılık ağacı
// izlenerek) `.next/standalone` altına kopyalamasını sağlar — Dockerfile'ın
// son aşaması (bkz. apps/web/Dockerfile) tüm monorepo'yu değil SADECE bu
// klasörü taşır, imaj küçük kalır. Vercel'e özel değil (mimari kural #6);
// Vercel bu bayrağı YOK SAYAR (kendi build çıktısını kullanır), yani
// Docker/VPS ve Vercel yolları AYNI next.config.ts ile çalışır.
//
// SADECE bayrakla açık şekilde istenen build'lerde (`STANDALONE_BUILD=1`)
// etkin — standalone çıktısı node_modules içinde symlink kopyalamaya
// çalışıyor, bu da Windows'ta Geliştirici Modu/yönetici izni olmadan
// EPERM ile patlıyor. Yerel `pnpm build` (Windows dahil) bu bayrak
// olmadan normal şekilde çalışmaya devam eder; Vercel de zaten bu alanı
// yok saydığı için ondan da etkilenmez.
//
// GitHub issue #51 / Prompt 9.1 notu: bu değişken eskiden `DOCKER_BUILD`
// idi (bkz. issue #46) — Tauri masaüstü kabuğu da (bkz. apps/desktop)
// AYNI standalone çıktıya (kendi kendine yeten server.js + gerçekten
// kullanılan node_modules) prod paketleme için sidecar process olarak
// ihtiyaç duyduğundan, bayrak tek bir tüketiciye (Docker) özel olmaktan
// çıkarılıp genel bir isme (`STANDALONE_BUILD`) taşındı. Davranış AYNI —
// sadece isim, artık iki tüketicisi olduğunu yansıtıyor. apps/web'in
// kendi kodu/davranışı bu değişiklikle DEĞİŞMEDİ, sadece bayrak adı.
const nextConfig: NextConfig = {
  ...(process.env.STANDALONE_BUILD === '1' ? { output: 'standalone' as const } : {}),
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
