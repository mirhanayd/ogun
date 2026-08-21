'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@ogun/db'
import {
  createOrReuseShare,
  getClientById,
  getClinicById,
  getLatestShareForPlan,
  getPlanById,
  recordShareSend,
  revokeShare,
} from '@ogun/db/queries'
import type { PlanShareSendChannel } from '@ogun/db/schema'
import { renderPlanPdfBuffer } from '@ogun/pdf/server'
import { assertPlanAccess, assertPlanShareAccess, withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'
import { resolvePlanPdfData } from '@/lib/pdf/resolve-plan-pdf-data'
import { getEmailSender } from '@/lib/email'
import { renderPlanShareEmail } from '@/lib/email/plan-share-template'
import type { PlanActionResult } from '@/app/(app)/planlar/actions'

// GitHub issue #36 / Prompt 6.2 — "Danışana ulaştırma" server action'ları.
// #35'in pdf-actions.ts'siyle AYNI iki katmanlı desen (getX/createX ayrımı,
// PlanActionResult<T> sarmalayıcı) — burada da withAuth(withAudit(...))
// zinciri KESİNTİSİZ uygulanıyor: paylaşım linki üretmek/iptal etmek/
// göndermek DANIŞAN VERİSİNE dokunan bir işlem (plan içeriği + iletişim
// bilgisi), /p/[token] GÖRÜNTÜLEME rotasının aksine (bkz. o rotanın
// page.tsx dosya başı notu, "possession-based auth" — bu dosyadaki
// KİMLİKLİ eylemlerin TAM ZITTI).

function buildShareUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/p/${token}`
}

export interface ShareLinkInfo {
  shareId: string
  url: string
  expiresAt: string | null
  revokedAt: string | null
  viewedAt: string | null
  viewCount: number
}

function toShareLinkInfo(share: {
  id: string
  token: string
  expiresAt: Date | null
  revokedAt: Date | null
  viewedAt: Date | null
  viewCount: number
}): ShareLinkInfo {
  return {
    shareId: share.id,
    url: buildShareUrl(share.token),
    expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
    revokedAt: share.revokedAt ? share.revokedAt.toISOString() : null,
    viewedAt: share.viewedAt ? share.viewedAt.toISOString() : null,
    viewCount: share.viewCount,
  }
}

// GÖREV 1: paylaşım linki üretimi/görüntüleme — aktif bir link varsa AYNEN
// döner (createOrReuseShare, bkz. queries/plan-shares.ts), yoksa yenisini
// açar. Diyaloğun açılışında çağrılır, "link oluştur" ayrı bir eylem OLARAK
// istemciye SUNULMAZ (roadmap metni sadece "link üretilebilsin/iptal
// edilebilsin" diyor, kullanıcı akışını gereksiz bir adım daha
// karmaşıklaştırmadan basitleştirdik).
const getOrCreateShareLinkForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan_share',
      entityId: (_args: [string], result: { id: string } | undefined) => result?.id ?? null,
      metadata: ([planId]: [string]) => ({ planId }),
    },
    async (ctx, planId: string) => {
      await assertPlanAccess(ctx, planId)
      return createOrReuseShare(db, ctx.scope.clinicId, planId, ctx.user.id)
    },
  ),
)

export async function getOrCreateShareLinkAction(planId: string): Promise<PlanActionResult<ShareLinkInfo>> {
  try {
    const share = await getOrCreateShareLinkForClinic(planId)
    return { success: true, data: toShareLinkInfo(share) }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Paylaşım linki oluşturulamadı.' }
  }
}

const getShareLinkForClinic = withAuth(
  withAudit(
    {
      action: 'read',
      entityType: 'plan_share',
      entityId: ([planId]: [string]) => planId,
    },
    async (ctx, planId: string) => {
      await assertPlanAccess(ctx, planId)
      return getLatestShareForPlan(db, ctx.scope.clinicId, planId)
    },
  ),
)

// Diyalog AÇILIŞINDA mevcut linki (varsa) göstermek için — üretmeden SADECE
// okur (viewCount/viewedAt en güncel halini görmek için her açılışta
// yeniden çekilir).
export async function getShareLinkStatusAction(planId: string): Promise<PlanActionResult<ShareLinkInfo | null>> {
  try {
    const share = await getShareLinkForClinic(planId)
    return { success: true, data: share ? toShareLinkInfo(share) : null }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Paylaşım linki okunamadı.' }
  }
}

const revokeShareLinkForClinic = withAuth(
  withAudit(
    {
      action: 'delete',
      entityType: 'plan_share',
      entityId: ([shareId]: [string, string]) => shareId,
      metadata: ([, planId]: [string, string]) => ({ planId }),
    },
    // planId ikinci parametre olarak SADECE audit metadata'sı (yukarıdaki
    // metadata fonksiyonu) için var — gövdede kullanılmıyor, withAudit'in
    // Args tuple'ını korumak için burada tutuluyor.
    async (ctx, shareId: string, planId: string) => {
      void planId
      await assertPlanShareAccess(ctx, shareId)
      return revokeShare(db, ctx.scope.clinicId, shareId)
    },
  ),
)

// GÖREV 1: "Diyetisyen linki iptal edebilsin".
export async function revokeShareLinkAction(
  shareId: string,
  planId: string,
  clientId: string,
): Promise<PlanActionResult<undefined>> {
  try {
    await revokeShareLinkForClinic(shareId, planId)
    revalidatePath(`/danisanlar/${clientId}/planlar/${planId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Paylaşım linki iptal edilemedi.' }
  }
}

const recordShareSendForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan_share_send',
      entityId: (_args: [string, PlanShareSendChannel, string | null], result: { id: string } | undefined) =>
        result?.id ?? null,
      metadata: ([shareId, channel]: [string, PlanShareSendChannel, string | null]) => ({ shareId, channel }),
    },
    async (ctx, shareId: string, channel: PlanShareSendChannel, recipient: string | null) => {
      await assertPlanShareAccess(ctx, shareId)
      return recordShareSend(db, ctx.scope.clinicId, shareId, { channel, recipient, sentBy: ctx.user.id })
    },
  ),
)

// GÖREV 2: WhatsApp gönderimi bir wa.me deep link'i (istemci tarafında
// açılır, bkz. share-dialog.tsx) — sunucu bunun GERÇEKTEN gönderildiğini
// teyit EDEMEZ (bkz. schema/plan-shares.ts planShareSends.recipient notu).
// Bu action sadece "diyetisyen gönder'e bastı" niyetini kaydeder.
export async function recordWhatsappSentAction(
  clientId: string,
  shareId: string,
  phone: string | null,
): Promise<PlanActionResult<undefined>> {
  try {
    await recordShareSendForClinic(shareId, 'whatsapp', phone)
    revalidatePath(`/danisanlar/${clientId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Kaydedilemedi.' }
  }
}

// GÖREV 3: e-posta gönderimi — PDF üretimi #35'in AYNI yolunu (renderPlanPdfBuffer
// + resolvePlanPdfData) kullanır, YENİDEN YAZILMAZ (bkz. bu dosyanın başı
// notu). E-posta EKİ olarak taze bir Buffer üretilir — documents tablosuna
// AYRICA kaydedilmez (dosya geçmişi zaten "İndir ve kaydet" akışıyla, #35,
// dolduruluyor; her e-posta gönderiminde tekrar bir belge satırı açmak
// gereksiz kopya üretirdi).
const sendPlanShareEmailForClinic = withAuth(
  withAudit(
    {
      action: 'create',
      entityType: 'plan_share_send',
      entityId: (_args: [string, string, string], result: { id: string } | undefined) => result?.id ?? null,
      metadata: ([planId, , recipient]: [string, string, string]) => ({ planId, recipient, channel: 'email' }),
    },
    async (ctx, planId: string, shareId: string, recipientEmail: string) => {
      await Promise.all([assertPlanAccess(ctx, planId), assertPlanShareAccess(ctx, shareId)])
      const [plan, clinic] = await Promise.all([
        getPlanById(db, ctx.scope.clinicId, planId),
        getClinicById(db, ctx.scope.clinicId),
      ])
      if (!plan || !plan.clientId) throw new Error('Plan veya danışan bulunamadı.')
      if (!clinic) throw new Error('Klinik bulunamadı.')

      const client = await getClientById(db, ctx.scope.clinicId, plan.clientId)
      if (!client) throw new Error('Danışan bulunamadı.')

      const share = await getLatestShareForPlan(db, ctx.scope.clinicId, planId)
      if (!share || share.id !== shareId || share.revokedAt) {
        throw new Error('Geçerli bir paylaşım linki bulunamadı — önce link oluşturun.')
      }

      const pdfData = await resolvePlanPdfData(db, ctx.scope.clinicId, planId, {
        density: clinic.pdfDefaultDensity,
        showCalories: clinic.pdfDefaultShowCalories,
        includeNutrientSummaryPage: false,
      })
      const pdfBuffer = await renderPlanPdfBuffer(pdfData)

      const { subject, html, text } = renderPlanShareEmail({
        clinicName: clinic.name,
        clinicLogoDataUri: clinic.logoUrl,
        clinicPrimaryColor: clinic.primaryColor,
        clientName: `${client.firstName} ${client.lastName}`,
        planName: plan.name,
        dietitianName: ctx.user.name,
        shareUrl: buildShareUrl(share.token),
      })

      const safeName = plan.name.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ _-]/g, '').trim()
      await getEmailSender().send({
        to: recipientEmail,
        subject,
        html,
        text,
        attachments: [
          { filename: `${safeName || 'diyet-plani'}.pdf`, contentType: 'application/pdf', content: pdfBuffer },
        ],
      })

      return recordShareSend(db, ctx.scope.clinicId, shareId, {
        channel: 'email',
        recipient: recipientEmail,
        sentBy: ctx.user.id,
      })
    },
  ),
)

export async function sendPlanShareEmailAction(
  planId: string,
  shareId: string,
  recipientEmail: string,
): Promise<PlanActionResult<undefined>> {
  if (!recipientEmail || !recipientEmail.includes('@')) {
    return { success: false, error: 'Geçerli bir e-posta adresi girin.' }
  }
  try {
    await sendPlanShareEmailForClinic(planId, shareId, recipientEmail)
    return { success: true }
  } catch (error) {
    // GÖREV: "actually sending a real email... document that live delivery
    // wasn't verified end-to-end" — bu hata mesajı RESEND_API_KEY
    // eksikliğinde de (bkz. resend-sender.ts) buraya düşer, kullanıcıya
    // anlaşılır bir Türkçe mesajla iletilir.
    return { success: false, error: error instanceof Error ? error.message : 'E-posta gönderilemedi.' }
  }
}
