import type { Metadata } from 'next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DESKTOP_INSTALL_STEPS,
  DESKTOP_PLATFORM_LABELS,
  DESKTOP_SYSTEM_REQUIREMENTS,
  getLatestDesktopRelease,
  type DesktopPlatform,
} from '@/lib/desktop-releases'
import { DesktopDownloadCta } from './desktop-download-cta'

// GitHub issue #54 / Prompt 9.4, GÖREV 4 — "web'de kalan tek şey" (bkz.
// faz-9-masaustu-kabugu.md tepesindeki KARAR notu): hesap oluşturma,
// abonelik VE uygulamayı indirme sayfası. Asıl ürün bu masaüstü uygulaması
// (Tauri) — bkz. o dosyanın "MİMARİ" notu.
//
// ROTA KARARI (bkz. docs/desktop-deployment.md bölüm 5, ayrıntılı gerekçe):
// Faz 10 (UI cilası, landing sayfası dahil) bu repoda henüz PLANLANMADI —
// bu yüzden GERÇEK, minimal, işlevsel bir `/indir` route'u ŞİMDİ inşa
// edildi (kök `/` hâlâ "Yakında" placeholder'ı, bkz. app/page.tsx). Faz 10
// geldiğinde bu sayfa yeniden tasarlanabilir/taşınabilir; route'un KENDİSİ
// zaten doğru yerde.
export const metadata: Metadata = {
  title: 'Öğün — Masaüstü Uygulamasını İndir',
  description:
    'Öğün masaüstü uygulamasını Windows veya macOS için indirin. Klinik verileriniz merkezi sunucuda güvenle saklanır, uygulama sadece native bir istemci penceresidir.',
}

const PLATFORMS: DesktopPlatform[] = ['windows', 'macos']

export default function IndirPage() {
  const release = getLatestDesktopRelease()

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-10 px-4 py-16">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="text-3xl font-semibold text-primary">Öğün</span>
        <h1 className="font-heading text-2xl font-medium">Masaüstü uygulamasını indirin</h1>
        <p className="max-w-xl text-balance text-muted-foreground">
          Öğün, kendi penceresi, görev çubuğu simgesi ve native bildirimleri olan bir masaüstü uygulamasıdır. Klinik
          verileriniz (danışanlar, planlar, ödemeler) her zaman merkezi sunucuda güvenle saklanır — uygulama sadece
          hızlı, native bir istemci penceresidir; internet bağlantısı gerektirir.
        </p>
      </header>

      {release ? (
        <section className="flex flex-col items-center gap-4 text-center">
          <Badge variant="secondary">Sürüm {release.version}</Badge>
          <DesktopDownloadCta release={release} />
        </section>
      ) : (
        <section className="flex flex-col items-center gap-2 rounded-xl bg-muted/50 p-8 text-center ring-1 ring-foreground/10">
          <Badge variant="outline">Yakında</Badge>
          <p className="max-w-md text-sm text-muted-foreground">
            İlk masaüstü sürümü hazırlanıyor. Bu sayfa, sürüm yayınlanır yayınlanmaz Windows ve macOS için doğru
            indirme bağlantılarını otomatik olarak burada gösterecek.
          </p>
        </section>
      )}

      {release && release.notes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sürüm notları — {release.version}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {release.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        {PLATFORMS.map((platform) => (
          <Card key={platform}>
            <CardHeader>
              <CardTitle>{DESKTOP_PLATFORM_LABELS[platform]}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Sistem gereksinimleri</p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {DESKTOP_SYSTEM_REQUIREMENTS[platform].map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase">Kurulum adımları</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {DESKTOP_INSTALL_STEPS[platform].map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Zaten bir hesabınız var mı?{' '}
        <a href="/giris" className="text-primary underline-offset-4 hover:underline">
          Giriş yapın
        </a>{' '}
        ya da kurulumdan sonra masaüstü uygulaması içinden devam edin.
      </p>
    </main>
  )
}
