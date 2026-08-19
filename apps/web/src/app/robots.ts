import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site-url'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 3 — "robots.txt".
//
// public/robots.txt (düz dosya) DEĞİL, app/robots.ts: sitemap satırının
// MUTLAK bir URL olması gerekiyor ve o URL dağıtıma göre değişiyor
// (NEXT_PUBLIC_SITE_URL, bkz. lib/site-url.ts) — statik bir dosyada bunu
// doğru tutmanın yolu yok.
//
// NEYE İZİN VERİLMİYOR VE NEDEN:
//   /api/       — uygulama uç noktaları, indekslenecek içerik değil.
//   /panel, /danisanlar, /planlar, /randevular, /finans, /tarifler,
//   /ayarlar   — kimlik doğrulaması gerektiren uygulama ekranları. Bot
//                zaten /giris'e yönlendirilir; taranmalarının tek etkisi
//                arama sonuçlarında boş/yönlendirme sayfaları olurdu.
//   /p/         — plan paylaşım bağlantıları. TOKEN'LI ve süreli (bkz.
//                packages/db/src/schema/plan-shares.ts): bir danışanın
//                diyet planının arama motoruna düşmesi KVKK açısından
//                kabul edilemez. `robots.txt` tek başına bir güvenlik
//                önlemi DEĞİLDİR (erişim kontrolü token'ın kendisinde) ama
//                kazara indekslenmeye karşı doğru katman burasıdır.
//   /kurulum, /dev — sırasıyla oturum içi kurulum sihirbazı ve geliştirme
//                yardımcıları; herkese açık içerik değil.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/panel',
        '/danisanlar',
        '/planlar',
        '/randevular',
        '/finans',
        '/tarifler',
        '/ayarlar',
        '/p/',
        '/kurulum',
        // GitHub issue #67 — oturum içi klinik seçim ekranı, /kurulum ile
        // aynı kategoride: herkese açık içerik değil.
        '/klinik-sec',
        '/dev',
      ],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
