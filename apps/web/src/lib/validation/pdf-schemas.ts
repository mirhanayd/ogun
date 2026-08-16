import { z } from 'zod'

// GitHub issue #35 / Prompt 6.1 — GÖREV "Template seçenekleri": PDF üretim
// diyaloğunun istemciden gönderdiği tercihler. format BİLEREK burada YOK —
// plan_output_format zaten plan seviyesinde bir alan (#28), PDF diyaloğu
// bunu override ETMEZ, sadece görüntüler (bkz. resolve-plan-pdf-data.ts
// PdfGenerationOptions — format tree.plan.outputFormat'tan gelir).
export const pdfGenerationOptionsSchema = z.object({
  density: z.enum(['compact', 'spacious']),
  showCalories: z.boolean(),
  includeNutrientSummaryPage: z.boolean(),
})
export type PdfGenerationOptionsInput = z.infer<typeof pdfGenerationOptionsSchema>
