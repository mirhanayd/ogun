// GitHub issue #35 / Prompt 6.1 — GÖREV: "Sunucu tarafı üretim... gerçek
// bir Buffer/stream üretmeli, #36 (paylaşım linki) bunu devralabilsin."
//
// Bu modül SADECE düz bir Node sürecinde çalışır (mimari kural #3 — Vercel'e
// özel API yok): @react-pdf/renderer'ın renderToBuffer'ı Node'un Buffer/
// stream API'lerini kullanır, herhangi bir serverless-özel görüntü/PDF
// API'sine bağımlı DEĞİL — bir Docker container içindeki plain Node
// process'inde de AYNEN çalışır. '@ogun/pdf/server' alt yolundan dışa
// aktarılır (bkz. package.json exports) — ana '@ogun/pdf' barrel'ı (index.ts)
// node:fs kullanan fonts.node.ts'i İÇERMEZ, tarayıcı bundle'ı bu dosyayı
// hiç görmez.
import { renderToBuffer } from '@react-pdf/renderer'
import { registerPdfFontsNode } from './fonts.node'
import { DietPlanDocument } from './components/DietPlanDocument'
import { pdfPlanDataSchema, type PdfPlanData } from './types'

// Girdi Zod ile doğrulanır (mimari kural #2 — `any` yok, tipler Zod'dan
// türetilir) — çağıran taraf (apps/web resolve-plan-pdf-data.ts) zaten
// doğru şekli üretiyor olsa da, sunucu tarafı üretim bir denetim kaydı
// (audit) yazdığı ve #36'nın paylaşım linkinin GİRDİSİ olacağı için burada
// bir kez daha savunmacı doğrulama yapılıyor.
export async function renderPlanPdfBuffer(data: PdfPlanData): Promise<Buffer> {
  const parsed = pdfPlanDataSchema.parse(data)
  registerPdfFontsNode()
  return renderToBuffer(<DietPlanDocument data={parsed} />)
}
