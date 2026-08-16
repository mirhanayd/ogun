import Link from 'next/link'
import { ArrowRight, Layers, Users } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

// Diyet planı editörü — packages/db/src/schema/plans.ts (#23) ve editör UI'ı
// (#25/#26) artık gerçek: gerçek plan OLUŞTURMA/DÜZENLEME akışı
// /danisanlar/[id]/planlar üzerinden yürüyor (bir plan HER ZAMAN bir
// danışana bağlı — şablonlar hariç). Bu sayfa (nav'daki "Planlar" öğesinin
// hedefi, bkz. _components/nav-items.ts) klinik GENELİNDE anlamlı olan tek
// alt-özelliğe, şablon kütüphanesine (GitHub issue #27 / Prompt 5.5)
// yönlendiren bir HUB'a dönüştü — önceki "Yakında" EmptyState stub'ının
// (bkz. git geçmişi) yerini alıyor.
export default function PlanlarPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Planlar</h1>
        <p className="text-sm text-muted-foreground">
          Diyet planları danışan bazlı oluşturulur ve düzenlenir. Klinik genelinde paylaşılan
          şablon kütüphanesine buradan ulaşabilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/planlar/sablonlar">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardContent className="flex items-start gap-3">
              <Layers className="size-5 shrink-0 text-primary" />
              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-1 font-medium">
                  Şablon kütüphanesi <ArrowRight className="size-3.5" />
                </p>
                <p className="text-sm text-muted-foreground">
                  Kategoriye göre filtrelenmiş hazır plan şablonları; bir danışan seçip anında bir
                  kopya oluşturun.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/danisanlar">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardContent className="flex items-start gap-3">
              <Users className="size-5 shrink-0 text-primary" />
              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-1 font-medium">
                  Danışana git <ArrowRight className="size-3.5" />
                </p>
                <p className="text-sm text-muted-foreground">
                  Yeni bir plan oluşturmak, önceki bir planı kopyalamak veya hedeften bir iskelet
                  üretmek için bir danışanın &quot;Planlar&quot; sekmesini açın.
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
