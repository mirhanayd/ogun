import { db } from '@ogun/db'
import { getClinicById } from '@ogun/db/queries'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireClinic } from '@/lib/authz'
import { DEFAULT_WHATSAPP_TEMPLATE } from '@/lib/share/message-template'
import { WhatsappTemplateForm } from './whatsapp-template-form'

// /ayarlar/paylasim — GitHub issue #36 / Prompt 6.2, GÖREV 2: "Klinik
// ayarlarında mesaj şablonu özelleştirilebilsin". /ayarlar/veri-guvenligi
// ile AYNI alt-sayfa deseni (bkz. o dosyanın dosya başı notu) — /ayarlar ana
// sayfasından bağlanan, rol kısıtını (owner, dietitian) sunucu tarafında da
// tekrar uygulayan bir nested route.
export default async function PaylasimAyarlariPage() {
  const { scope, role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')
  const clinic = await getClinicById(db, scope.clinicId)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp mesaj şablonu</CardTitle>
          <CardDescription>
            Danışana plan paylaşım linkini WhatsApp üzerinden gönderirken kullanılacak hazır mesaj metni (bkz.
            danışan planları — &ldquo;Paylaş&rdquo; diyaloğu). Değişiklik sadece bundan sonraki gönderimleri
            etkiler.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsappTemplateForm
            defaultValues={{ whatsappMessageTemplate: clinic?.whatsappMessageTemplate ?? DEFAULT_WHATSAPP_TEMPLATE }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
import { redirect } from 'next/navigation'
