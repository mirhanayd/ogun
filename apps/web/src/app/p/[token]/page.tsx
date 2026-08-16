import type { Metadata } from 'next'
import { db } from '@ogun/db'
import { getClinicById, getPublicShareByToken, recordPublicShareView } from '@ogun/db/queries'
import { resolvePlanPdfData } from '@/lib/pdf/resolve-plan-pdf-data'
import { SharePlanView } from './share-plan-view'

// GitHub issue #36 / Prompt 6.2, GÖREV 1 — "/p/[token] — auth gerektirmeyen,
// mobil öncelikli plan görüntüleme sayfası. Sadece plan içeriği görünsün;
// danışanın sağlık verisi, ölçümleri, notları ASLA."
//
// BU ROTA apps/web/src/app/(app)/layout.tsx'in DIŞINDA — app/p/[token], route
// group parantezine GİRMEDİĞİ için (app) kabuğunun requireClinic() zorunluluğunu
// MİRAS ALMAZ (bkz. o layout'un dosya başı notu: "Bu route group'un TAMAMI
// kimlik doğrulaması... gerektirir"). Bu, projede kasıtlı olarak AÇILAN TEK
// public rota (bkz. görev talimatı — authz.ts'in her yerde zorladığı
// requireAuth/requireClinic kuralına bilinçli, spec-onaylı bir istisna).
//
// VERİ SIZINTISI ÖNLEMİ: bu sayfa clients/measurements/client_health gibi
// tablolara ASLA doğrudan erişmez. Tek veri kaynağı resolvePlanPdfData'nın
// döndürdüğü PdfPlanData — #35'in (PDF üretimi) zaten sağlık verisi
// TAŞIMAYACAK şekilde tasarladığı TEK şekil (bkz. packages/pdf/src/types.ts
// dosya başı notu: bu paket "danışanın sağlık verisini" DEĞİL, sadece plan
// içeriğini modelliyor). getPublicShareByToken (queries/plan-shares.ts) da
// AYNI disiplinle SADECE plan_shares + dietPlans.id/clinicId döner, hiçbir
// client/health alanı bu rotaya sızmaz.
export const metadata: Metadata = {
  title: 'Beslenme planınız — Öğün',
  robots: { index: false, follow: false },
}

export default async function PublicPlanSharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const lookup = await getPublicShareByToken(db, token)

  if (lookup.status === 'not_found') {
    return <StateScreen title="Bağlantı bulunamadı" description="Bu paylaşım bağlantısı geçerli değil." />
  }
  if (lookup.status === 'revoked') {
    return (
      <StateScreen
        title="Bağlantı iptal edildi"
        description="Diyetisyeniniz bu paylaşım bağlantısını iptal etti. Güncel planınız için lütfen diyetisyeninizle iletişime geçin."
      />
    )
  }
  if (lookup.status === 'expired') {
    return (
      <StateScreen
        title="Bağlantının süresi doldu"
        description="Bu paylaşım bağlantısının süresi sona erdi. Güncel bir bağlantı için lütfen diyetisyeninizle iletişime geçin."
      />
    )
  }

  const clinic = await getClinicById(db, lookup.clinicId)
  if (!clinic) {
    return <StateScreen title="Bağlantı bulunamadı" description="Bu paylaşım bağlantısı geçerli değil." />
  }

  // GÖREV 4: "Diyetisyen 'danışan planı açtı mı' görebilsin" — her
  // görüntülemede tetiklenir (COALESCE ile viewedAt sadece İLKİNDE set
  // edilir, bkz. queries/plan-shares.ts). Render'ı BEKLETMEMESİ için ayrı
  // await edilir ama hata sayfayı KIRMAMALI (görüntüleme izleme, plan
  // içeriğinin kendisinden daha az kritik).
  try {
    await recordPublicShareView(db, lookup.shareId)
  } catch (error) {
    console.error('[p/token] görüntüleme kaydı başarısız:', error)
  }

  const pdfData = await resolvePlanPdfData(db, lookup.clinicId, lookup.planId, {
    density: clinic.pdfDefaultDensity,
    showCalories: clinic.pdfDefaultShowCalories,
    includeNutrientSummaryPage: false,
  })

  return <SharePlanView data={pdfData} />
}

function StateScreen({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border border-border bg-background p-6 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
