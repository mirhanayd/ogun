import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/site-url'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 3 — "sitemap.ts".
//
// SADECE HERKESE AÇIK ROTALAR. Bu üç sayfa, Faz 9 sonrası web yüzeyinin
// TAMAMI: pazarlama sayfası, indirme sayfası (#54) ve hesap oluşturma.
// Giriş/şifre sıfırlama BİLEREK dışarıda — indekslenmelerinin bir değeri
// yok. Uygulama ekranları ve /p/ paylaşım bağlantıları için bkz. robots.ts.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    { url: absoluteUrl('/'), lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: absoluteUrl('/indir'), lastModified, changeFrequency: 'weekly', priority: 0.8 },
    { url: absoluteUrl('/kayit'), lastModified, changeFrequency: 'monthly', priority: 0.5 },
  ]
}
