import { notFound } from 'next/navigation'
import { db } from '@ogun/db'
import { getPilotMetrics } from '@ogun/db/queries'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuth } from '@/lib/authz'

// GitHub issue #47 / Prompt 8.3, GÖREV 4 — "Pilot ölçüm paneli. İç kullanım
// için: aktif klinik sayısı, oluşturulan plan sayısı, ortalama plan oluşturma
// süresi, en çok aranan besinler, arama sonucu bulunamayan sorgular."
//
// Bu sayfa BİLİNÇLİ OLARAK nav-items.ts'e (sidebar/bottom nav) EKLENMEDİ —
// "iç kullanım için" ifadesi platform genelinde (TEK bir kliniğe değil,
// TÜM kliniklere) bakan bir görünüm istiyor, bu normal bir klinik
// rolüyle (owner/dietitian) korunamaz — bir klinik sahibi olmak başka
// kliniklerin verisini görme HAKKI vermez. Erişim bunun yerine bir e-posta
// allowlist'iyle (PILOT_METRICS_ACCESS_EMAILS ortam değişkeni, virgülle
// ayrılmış) sınırlanıyor — env.ts'in ZORUNLU şemasına EKLENMEDİ çünkü bu
// tamamen opsiyonel bir iç araç, boşsa sayfa herkese 404 döner (varsayılan
// GÜVENLİ: erişim listesi yoksa KİMSE göremez).
function getAllowedEmails(): Set<string> {
  const raw = process.env.PILOT_METRICS_ACCESS_EMAILS ?? ''
  return new Set(
    raw
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  )
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} sn`
}

export default async function PilotMetricsPage() {
  const ctx = await requireAuth()
  const allowedEmails = getAllowedEmails()
  if (!allowedEmails.has(ctx.user.email.toLowerCase())) {
    notFound()
  }

  const metrics = await getPilotMetrics(db)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Pilot ölçüm paneli</h1>
        <p className="text-sm text-muted-foreground">
          İç kullanım içindir — platform genelinde toplu sayımlar, tek bir kliniğe özgü değildir.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Aktif klinik sayısı" value={String(metrics.activeClinicCount)} />
        <StatCard label="Oluşturulan plan sayısı" value={String(metrics.plansCreatedCount)} />
        <StatCard label="Ortalama plan oluşturma süresi" value={formatDuration(metrics.averagePlanCreationDurationMs)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm font-medium">En çok aranan besinler</p>
            {metrics.mostSearchedFoods.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz veri yok.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {metrics.mostSearchedFoods.map((row) => (
                  <li key={row.normalizedQuery} className="flex items-center justify-between text-sm">
                    <span>{row.sampleQuery}</span>
                    <Badge variant="secondary">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm font-medium">Sonuç bulunamayan aramalar</p>
            <p className="text-xs text-muted-foreground">
              Bu liste, veri tabanında eksik olan Türk yemeklerini/besinleri gösterir — en sık
              tekrarlanan başarısız aramalar önceliklendirilmelidir.
            </p>
            {metrics.zeroResultSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz veri yok.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {metrics.zeroResultSearches.map((row) => (
                  <li key={row.normalizedQuery} className="flex items-center justify-between text-sm">
                    <span>{row.sampleQuery}</span>
                    <Badge variant="destructive">{row.count}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}
