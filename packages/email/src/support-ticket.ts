import type { SendEmailInput } from './types'

export type SupportEmailType = 'ticket_created' | 'public_reply' | 'waiting_for_clinic' | 'resolved' | 'closed' | 'reopened'

export interface SupportEmailData {
  type: SupportEmailType
  recipientEmail: string
  referenceCode: string
  title: string
  statusLabel: string
  ticketUrl: string
  messagePreview?: string | null
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function subject(data: SupportEmailData) {
  if (data.type === 'ticket_created') return `Destek talebiniz alındı — ${data.referenceCode}`
  if (data.type === 'resolved') return `Destek talebiniz çözüldü — ${data.referenceCode}`
  if (data.type === 'closed') return `Destek talebiniz kapatıldı — ${data.referenceCode}`
  if (data.type === 'reopened') return `Destek talebiniz yeniden açıldı — ${data.referenceCode}`
  if (data.type === 'waiting_for_clinic') return `Destek talebiniz için yanıtınız bekleniyor — ${data.referenceCode}`
  return `Destek talebiniz güncellendi — ${data.referenceCode}`
}

export function buildSupportTicketEmail(data: SupportEmailData): SendEmailInput {
  const heading = subject(data)
  const preview = data.messagePreview?.trim().slice(0, 500)
  const text = [heading, `Başlık: ${data.title}`, `Referans: ${data.referenceCode}`, `Durum: ${data.statusLabel}`, preview ? `Mesaj: ${preview}` : '', `Talebi görüntüle: ${data.ticketUrl}`].filter(Boolean).join('\n\n')
  return {
    to: data.recipientEmail,
    subject: heading,
    text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#12211b"><h1 style="font-size:22px">${escapeHtml(heading)}</h1><p><strong>Başlık:</strong> ${escapeHtml(data.title)}<br><strong>Referans:</strong> ${escapeHtml(data.referenceCode)}<br><strong>Durum:</strong> ${escapeHtml(data.statusLabel)}</p>${preview ? `<div style="padding:12px;background:#f4f7f5;border-radius:8px">${escapeHtml(preview)}</div>` : ''}<p><a href="${escapeHtml(data.ticketUrl)}">Talebi görüntüle</a></p><p style="font-size:12px;color:#607069">Bu e-posta yalnız talebi oluşturan kullanıcıya gönderilmiştir.</p></div>`,
  }
}
