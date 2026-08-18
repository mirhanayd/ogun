// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 3 — "metadata: title,
// description, canonical" + robots.txt + sitemap.ts. Üçü de MUTLAK bir taban
// URL'e ihtiyaç duyar (canonical/sitemap göreli URL kabul ETMEZ), bu yüzden
// tek bir okuma noktası.
//
// NEDEN YENİ BİR DEĞİŞKEN (NEXT_PUBLIC_BETTER_AUTH_URL'i YENİDEN KULLANMAK
// YERİNE): o değişken auth callback'lerinin gittiği API kökü — masaüstü
// (Tauri) kabuğunda ve yerel geliştirmede pazarlama sitesinin adresiyle AYNI
// OLMAK ZORUNDA DEĞİL (bkz. apps/web/src/lib/auth-client.ts ve
// docs/desktop-deployment.md). Canonical/sitemap için "sitenin herkese açık
// adresi" ayrı, açıkça isimlendirilmiş bir kavram.
//
// Tanımlı değilse (bu sandbox'ta ve yerel geliştirmede böyle)
// http://localhost:3000'e düşer — env.ts'te BİLEREK opsiyonel: eksik olması
// uygulamayı başlatmamalı, sadece canonical/sitemap yerel adresi gösterir.
// Üretimde docs/deployment.md'de ZORUNLU olarak işaretli.
const FALLBACK_SITE_URL = 'http://localhost:3000'

export function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!raw) return new URL(FALLBACK_SITE_URL)
  try {
    return new URL(raw)
  } catch {
    // Bozuk bir değer yüzünden TÜM sayfa render'ı çökmesin — metadata
    // üretimi bir sayfanın ana işlevi değil.
    return new URL(FALLBACK_SITE_URL)
  }
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, getSiteUrl()).toString()
}
