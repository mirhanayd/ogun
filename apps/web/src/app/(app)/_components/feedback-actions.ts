'use server'

import { db } from '@ogun/db'
import { createFeedbackReport } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { scrubPiiFromText } from '@/lib/monitoring/pii-scrub'

// GitHub issue #47 / Prompt 8.3, GÖREV 2 — "uygulama içi geri bildirim
// butonu (ekran görüntüsü + konsol logu ekli)". message/consoleLog SERBEST
// METİN olduğu için (bkz. lib/monitoring/console-buffer.ts dosya başı notu)
// #45'in pii-scrub.ts'i (Sentry/pino için yazılmış AYNI kırpma motoru)
// burada da çalıştırılır — bir diyetisyen "X danışanının Y hastalığı için
// hesaplama hatalı" gibi bir geri bildirim yazarsa (gerçek bir senaryo),
// e-posta/telefon/TC kimlik gibi KALIP eşleşen kısımlar kırpılır. Bu tam bir
// çözüm DEĞİL (serbest metindeki bir isim/tanı kalıp eşleşmeyebilir) — bu
// yüzden feedbackReports tablosu KENDİSİ danışan verisi tablosu gibi
// ele alınmalı (clinicId-scoped, bkz. schema/analytics.ts), "hiç sağlık
// verisi girmeyecek" bir GARANTİ değil, bir azaltma katmanı.
const MAX_SCREENSHOT_LENGTH = 3_000_000 // ~2.2MB ikili veri (base64 şişirmesiyle)

const submitFeedbackForClinic = withAuth(
  withAudit(
    { action: 'create', entityType: 'feedback' },
    async (
      ctx,
      input: { page: string; message: string; consoleLog: string | null; screenshotDataUrl: string | null },
    ) => {
      const screenshotDataUrl =
        input.screenshotDataUrl && input.screenshotDataUrl.length <= MAX_SCREENSHOT_LENGTH
          ? input.screenshotDataUrl
          : null

      return createFeedbackReport(db, {
        clinicId: ctx.scope.clinicId,
        userId: ctx.user.id,
        page: input.page,
        message: scrubPiiFromText(input.message),
        consoleLog: input.consoleLog ? scrubPiiFromText(input.consoleLog) : null,
        screenshotDataUrl,
      })
    },
  ),
)

export interface SubmitFeedbackResult {
  success: boolean
  error?: string
}

export async function submitFeedbackAction(input: {
  page: string
  message: string
  consoleLog: string | null
  screenshotDataUrl: string | null
}): Promise<SubmitFeedbackResult> {
  const message = input.message.trim()
  if (message.length === 0) {
    return { success: false, error: 'Lütfen bir mesaj yazın.' }
  }
  if (message.length > 4000) {
    return { success: false, error: 'Mesaj çok uzun (en fazla 4000 karakter).' }
  }

  try {
    await submitFeedbackForClinic({ ...input, message })
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Geri bildirim gönderilemedi.' }
  }
}
