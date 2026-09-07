import React from 'react'
import Link from 'next/link'
import { db } from '@ogun/db'
import { getClinicalReviewDashboardKpis } from '@ogun/db/queries'
import {
  requireReviewer,
} from '@/lib/clinical-review/authz'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ListFilter,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
  Users,
  Layers,
  Sparkles,
  FileSearch,
} from 'lucide-react'

export default async function ClinicalReviewDashboardPage() {
  const session = await requireReviewer()
  const kpis = await getClinicalReviewDashboardKpis(db, session.user.id)
  const isClinicalAdmin = session.profile.professionalRole === 'clinical_admin'

  const primaryCards = [
    {
      title: 'Bana Atananlar',
      value: kpis.assignedToMe,
      description: 'Aktif olarak üzerinizde olan adaylar',
      href: '/clinical-review/assigned',
      icon: UserCheck,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'İnceleme Bekleyen',
      value: kpis.pending,
      description: 'Henüz hakem atanmamış yeni adaylar',
      href: '/clinical-review/queue?status=pending',
      icon: Clock,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      title: 'İncelemede (In Review)',
      value: kpis.inReview,
      description: 'Hakemler tarafından açılmış ve incelenenler',
      href: '/clinical-review/queue?status=in_review',
      icon: FileSearch,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-500/10',
    },
    {
      title: 'Daha Fazla Kanıt İstenen',
      value: kpis.needsMoreEvidence,
      description: 'Ek klinik/literatür araştırması bekleyenler',
      href: '/clinical-review/queue?status=needs_more_evidence',
      icon: HelpCircle,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      title: 'Onaylanan (Approved)',
      value: kpis.approved,
      description: 'Hakem onayını almış kararlar',
      href: '/clinical-review/queue?status=approved',
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      title: 'Yayınlamaya Hazır',
      value: kpis.readyToPublish,
      description: 'Tüm kural & konsensüs şartlarını tamamlamış',
      href: isClinicalAdmin ? '/clinical-review/admin/publish' : '/clinical-review/queue?status=ready_to_publish',
      icon: Sparkles,
      color: 'text-emerald-700 dark:text-emerald-300',
      bg: 'bg-emerald-600/20',
      highlight: true,
    },
  ]

  return (
    <div className="space-y-8">
      {/* Dashboard Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Klinik İnceleme Portalı
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            openFDA ve klinik kaynaklardan türetilen ilaç-besin etkileşim adaylarını doğrulayın, inceleyin ve yönetin.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/clinical-review/queue">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm">
              <ListFilter className="h-4 w-4" />
              <span>İnceleme Havuzuna Git</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Source Changed Alert Banner (if any) */}
      {(kpis.sourceChanged ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-800 dark:text-rose-300">
          <ShieldAlert className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-sm">Kaynak Metni Değişen Adaylar ({kpis.sourceChanged})</h4>
            <p className="text-xs sm:text-sm mt-0.5 opacity-90">
              Yeni FDA etiket güncellemesi nedeniyle semantik hash&apos;i değişen adaylar tespit edildi. Eski onaylar
              geçersiz kılınmış olup adayın tekrar incelenmesi gerekmektedir.
            </p>
            <div className="mt-2">
              <Link
                href="/clinical-review/queue?status=source_changed"
                className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:opacity-80"
              >
                Değişen Adayları Gör
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div>
        <h2 className="text-base font-semibold mb-4 text-foreground/90">İnceleme Durumu</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {primaryCards.map((card) => {
            const Icon = card.icon
            return (
              <Link key={card.title} href={card.href} className="block transition-transform hover:-translate-y-0.5">
                <Card className={`h-full border-border/80 transition-shadow hover:shadow-md ${card.highlight ? 'border-emerald-600/40' : ''}`}>
                  <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground line-clamp-1">{card.title}</span>
                      <div className={`p-1.5 rounded-md ${card.bg} ${card.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                        {card.value}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                        {card.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Clinical Admin Overview Section */}
      {isClinicalAdmin && (
        <div className="space-y-4 border-t border-border/60 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground/90">Klinik Yönetici Paneli</h2>
              <p className="text-xs text-muted-foreground">Öncelik dağılımı, hakem havuzu ve sistem metrikleri</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/clinical-review/admin/reviewers">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  <span>Hakemler ({kpis.activeReviewersCount})</span>
                </Button>
              </Link>
              <Link href="/clinical-review/admin/publish">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Yayınla ({kpis.readyToPublish})</span>
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Link href="/clinical-review/queue?priority=P1" className="block">
              <Card className="border-border/80 hover:border-red-500/40 hover:bg-red-500/5 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="destructive" className="font-semibold text-xs">P1</Badge>
                    <span className="text-xs text-muted-foreground">Yüksek Öncelik</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{kpis.p1}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Doğrudan SPL Eşleşmesi</div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/clinical-review/queue?priority=P2" className="block">
              <Card className="border-border/80 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 font-semibold text-xs">P2</Badge>
                    <span className="text-xs text-muted-foreground">Öncelik 2</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{kpis.p2}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Orta-Yüksek Kanıt</div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/clinical-review/queue?priority=P3" className="block">
              <Card className="border-border/80 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-400 font-semibold text-xs">P3</Badge>
                    <span className="text-xs text-muted-foreground">Öncelik 3</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{kpis.p3}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Genişletilmiş Kanıt</div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/clinical-review/queue?priority=P4" className="block">
              <Card className="border-border/80 hover:border-border transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-semibold">P4</Badge>
                    <span className="text-xs text-muted-foreground">Öncelik 4</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{kpis.p4}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Sınırlı Eşleşme</div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/clinical-review/queue?priority=P5" className="block">
              <Card className="border-border/80 hover:border-border transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs font-semibold">P5</Badge>
                    <span className="text-xs text-muted-foreground">Öncelik 5</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">{kpis.p5}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Düşük Güvenilirlik</div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Toplam Havuz Adayı
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{kpis.totalTasks}</div>
                <p className="text-xs text-muted-foreground mt-1">openFDA snapshot verisinden senkronize edildi</p>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Atama Bekleyen (Unassigned)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{kpis.unassigned}</div>
                <p className="text-xs text-muted-foreground mt-1">Herhangi bir hakeme henüz zimmetlenmemiş</p>
              </CardContent>
            </Card>

            <Card className="border-border/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Yayınlanan (Published in Production)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {kpis.published}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Kanonik onay hattından geçerek production&apos;a aktarıldı
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Quick Access Action Bar */}
      <div className="rounded-xl border border-border/80 bg-muted/30 p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">İnceleme İş Akışına Başlayın</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Uzmanlık alanınıza uygun P1 ve P2 adayları inceleyerek klinik konsensüs sürecine katkı sağlayın.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/clinical-review/assigned">
              <Button variant="outline" size="sm" className="gap-1.5">
                <UserCheck className="h-4 w-4" />
                <span>Bana Atananlar ({kpis.assignedToMe})</span>
              </Button>
            </Link>
            <Link href="/clinical-review/queue?priority=P1">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
                <Layers className="h-4 w-4" />
                <span>P1 Adayları Aç ({kpis.p1})</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
