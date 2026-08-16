import { notFound } from 'next/navigation'
import {
  CalendarDays,
  ClipboardList,
  ClipboardPlus,
  FlaskConical,
  FolderOpen,
  Ruler,
  Stethoscope,
  Wallet,
} from 'lucide-react'
import { db } from '@ogun/db'
import { listClinicDietitians } from '@ogun/db/queries'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/empty-state'
import { requireClinic } from '@/lib/authz'
import { viewClientRecord } from '@/lib/data-subject-rights'
import { calculateAge } from '@/lib/client-age'
import { SEX_LABELS_TR } from '@/lib/validation/client-schemas'
import { GeneralTabForm } from './general-tab-form'

function initials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

// /danisanlar/[id] — GitHub issue #17 / Prompt 4.1, GÖREV 4: danışan detay
// sayfası KABUĞU. Sadece "Genel" sekmesi gerçek içerik taşır (bu issue'nun
// kapsamındaki alanlar); diğer sekmeler EmptyState stub — hangi gelecek
// issue'nun onları dolduracağı her birinde ayrıca not edildi.
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { scope } = await requireClinic()

  const [client, dietitians] = await Promise.all([viewClientRecord(id), listClinicDietitians(db, scope.clinicId)])

  // Soft-delete edilmiş (bkz. schema/clients.ts deletedAt) bir kayıt normal
  // uygulama akışında GÖRÜNTÜLENMEZ — veri sahibi hakları akışı (dışa
  // aktarma/silme onayı) ayrı bir yüzeyde, bu sayfada değil.
  if (!client || client.deletedAt) {
    notFound()
  }

  const age = calculateAge(client.birthDate)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar size="lg">
            <AvatarFallback>{initials(client.firstName, client.lastName)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">
                {client.firstName} {client.lastName}
              </h1>
              <Badge variant="secondary">{age !== null ? `${age} yaş` : 'Yaş —'}</Badge>
              {client.sex && <Badge variant="outline">{SEX_LABELS_TR[client.sex]}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {client.phone || 'Telefon —'} {client.email ? `· ${client.email}` : ''}
            </p>
          </div>
          {/* Güncel kilo / BKİ / hedef / son görüşme — measurements (GitHub
              issue #18 / Prompt 4.2), client_goals (aynı issue) ve randevu
              modülü (henüz açılmamış) tabloları bu repoda henüz YOK. Bu dört
              alan o tablolar gelince buraya birer sorguyla bağlanacak. */}
          <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <SummaryStat label="Güncel kilo" value="—" />
            <SummaryStat label="BKİ" value="—" />
            <SummaryStat label="Hedef" value="—" />
            <SummaryStat label="Son görüşme" value="—" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
        <Tabs defaultValue="genel">
          <TabsList>
            <TabsTrigger value="genel">Genel</TabsTrigger>
            <TabsTrigger value="olcumler">Ölçümler</TabsTrigger>
            <TabsTrigger value="planlar">Planlar</TabsTrigger>
            <TabsTrigger value="anamnez">Anamnez</TabsTrigger>
            <TabsTrigger value="laboratuvar">Laboratuvar</TabsTrigger>
            <TabsTrigger value="dosyalar">Dosyalar</TabsTrigger>
            <TabsTrigger value="randevular">Randevular</TabsTrigger>
            <TabsTrigger value="odemeler">Ödemeler</TabsTrigger>
          </TabsList>

          <TabsContent value="genel" className="mt-4">
            <GeneralTabForm client={client} dietitians={dietitians} />
          </TabsContent>

          <TabsContent value="olcumler" className="mt-4">
            <EmptyState
              icon={Ruler}
              title="Ölçümler bu bölüm henüz hazır değil"
              description="Kilo, çevre ölçümleri ve vücut kompozisyonu takibi GitHub issue #18 (Prompt 4.2 — Ölçüm ve ilerleme) kapsamında eklenecek."
            />
          </TabsContent>

          <TabsContent value="planlar" className="mt-4">
            <EmptyState
              icon={ClipboardList}
              title="Planlar bu bölüm henüz hazır değil"
              description="Diyet planı editörü, roadmap'in Hafta 5 (Prompt 5.x — Plan şeması ve editörü) kapsamındaki ayrı bir modülde eklenecek."
            />
          </TabsContent>

          <TabsContent value="anamnez" className="mt-4">
            <EmptyState
              icon={Stethoscope}
              title="Anamnez bu bölüm henüz hazır değil"
              description="Tam anamnez formu (client_health tablosu bu issue'da açıldı, forma bağlanması) GitHub issue #19 (Prompt 4.3) kapsamında eklenecek."
            />
          </TabsContent>

          <TabsContent value="laboratuvar" className="mt-4">
            <EmptyState
              icon={FlaskConical}
              title="Laboratuvar bu bölüm henüz hazır değil"
              description="Laboratuvar sonuçları takibi GitHub issue #19 (Prompt 4.3) kapsamında eklenecek."
            />
          </TabsContent>

          <TabsContent value="dosyalar" className="mt-4">
            <EmptyState
              icon={FolderOpen}
              title="Dosyalar bu bölüm henüz hazır değil"
              description="Belge/dosya yükleme GitHub issue #19 (Prompt 4.3) kapsamında eklenecek."
            />
          </TabsContent>

          <TabsContent value="randevular" className="mt-4">
            <EmptyState
              icon={CalendarDays}
              title="Randevular bu bölüm henüz hazır değil"
              description="Randevu takvimi, roadmap'in Hafta 7 (Prompt 7.1 — Randevu takvimi) kapsamındaki ayrı bir modülde eklenecek."
            />
          </TabsContent>

          <TabsContent value="odemeler" className="mt-4">
            <EmptyState
              icon={Wallet}
              title="Ödemeler bu bölüm henüz hazır değil"
              description="Paket ve tahsilat takibi, roadmap'in Hafta 7 (Prompt 7.2 — Paket ve tahsilat takibi) kapsamındaki ayrı bir modülde eklenecek."
            />
          </TabsContent>
        </Tabs>

        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm font-medium">Hızlı eylemler</p>
            {/* Bu üç eylem henüz kurulmamış modüllere (#18, plan editörü,
                randevu modülü) gider — command-palette.tsx'in "Danışan ara"
                girdisinde (GitHub issue #11 / Prompt 3.2) kurulan "modül
                yoksa devre dışı + Yakında rozeti" desenini burada da
                uyguluyoruz; ölü bir link yerine dürüst bir "yakında" göstergesi. */}
            <QuickAction icon={Ruler} label="Yeni ölçüm" />
            <QuickAction icon={ClipboardPlus} label="Yeni plan" />
            <QuickAction icon={CalendarDays} label="Randevu ver" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function QuickAction({ icon: Icon, label }: { icon: typeof Ruler; label: string }) {
  return (
    <Button variant="outline" size="sm" disabled className="justify-start gap-1.5">
      <Icon />
      {label}
      <Badge variant="secondary" className="pointer-events-none ml-auto">
        Yakında
      </Badge>
    </Button>
  )
}
