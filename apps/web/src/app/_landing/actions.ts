'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { getEmailSender } from '@/lib/email'
import { logger } from '@/lib/monitoring/logger'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 2 — "Fiyatları henüz yazma —
// 'Pilot fiyatlandırması' etiketi ve İLETİŞİM FORMU."
//
// NEDEN E-POSTA, YENİ BİR TABLO DEĞİL: bu form KİMLİK DOĞRULANMAMIŞ bir
// ziyaretçiden gelir. Depodaki tek serbest-metin toplama tablosu
// feedback_reports (bkz. packages/db/src/schema/analytics.ts) ve o tablo
// clinicId + userId ZORUNLU — yani bir ziyaretçinin talebi oraya YAZILAMAZ.
// Sırf bu form için yeni bir tablo + migration açmak, henüz fiyatı bile
// belli olmayan bir pilot için erken; #36'da kurulan EmailSender soyutlaması
// (lib/email/index.ts) zaten "gönderim mekanizmasını değiştirilebilir tut"
// diye var ve burada AYNEN kullanılıyor.
//
// TEK DEĞİŞKEN, HEM HEDEF HEM GÖRÜNEN ADRES: NEXT_PUBLIC_PILOT_CONTACT_EMAIL.
// Bir iletişim adresinin ZATEN herkese açık olması gerekir (form
// gönderilemezse ziyaretçi doğrudan yazabilmeli, bkz. pricing.tsx'teki
// mailto bağlantısı) — bu yüzden sunucu için ayrı, gizli bir ikinci
// değişken tutmak yapay bir ayrım olurdu.
//
// YAPILANDIRILMAMIŞSA SESSİZCE KAYBETMEZ: bu değişken ya da RESEND_*
// tanımlı değilse (yerel geliştirme, bu sandbox) talep sunucu loguna
// YAZILIR ve kullanıcıya AÇIK bir hata döner — form asla "gönderildi"
// deyip talebi çöpe atmaz.
const contactSchema = z.object({
  name: z.string().trim().min(2, 'Adınızı yazın.').max(120, 'Ad çok uzun.'),
  email: z.string().trim().email('Geçerli bir e-posta adresi yazın.').max(200),
  clinic: z.string().trim().max(160, 'Klinik adı çok uzun.').optional(),
  plan: z.enum(['başlangıç', 'klinik', 'kurumsal', 'emin-degilim']),
  message: z.string().trim().max(2000, 'Mesaj çok uzun (en fazla 2000 karakter).').optional(),
  // Bal küpü (honeypot): gerçek kullanıcı bu alanı GÖREMEZ (aria-hidden +
  // ekran dışı), bot doldurur. Doluysa istek sessizce BAŞARILI görünür ama
  // e-posta GÖNDERİLMEZ — bota "yakalandın" sinyali vermemek için.
  website: z.string().max(0).optional(),
})

export interface PilotContactResult {
  success: boolean
  error?: string
  /** Alan bazlı doğrulama hataları — formda ilgili girdinin altında gösterilir. */
  fieldErrors?: Partial<Record<'name' | 'email' | 'clinic' | 'plan' | 'message', string>>
}

const PLAN_LABELS: Record<string, string> = {
  'başlangıç': 'Başlangıç',
  klinik: 'Klinik',
  kurumsal: 'Kurumsal',
  'emin-degilim': 'Emin değilim',
}

// Kaba ama gerçek bir kötüye kullanım freni: aynı IP'den 10 dakikada en fazla
// 3 talep. TEK süreç belleğinde tutulur — yatay ölçeklenmiş bir dağıtımda
// instance başına sayar (Redis'e taşınabilir); yine de tek bir bota karşı
// anlamlı bir engel ve hiçbir dış bağımlılık getirmiyor.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX = 3
const submissionLog = new Map<string, number[]>()

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (submissionLog.get(key) ?? []).filter((at) => now - at < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    submissionLog.set(key, recent)
    return true
  }
  recent.push(now)
  submissionLog.set(key, recent)
  // Belleğin sınırsız büyümesini engelle: pencere dışında kalan anahtarları at.
  if (submissionLog.size > 5000) {
    for (const [existingKey, timestamps] of submissionLog) {
      if (timestamps.every((at) => now - at >= RATE_LIMIT_WINDOW_MS)) submissionLog.delete(existingKey)
    }
  }
  return false
}

export async function submitPilotContactAction(formData: FormData): Promise<PilotContactResult> {
  const parsed = contactSchema.safeParse({
    name: formData.get('name') ?? '',
    email: formData.get('email') ?? '',
    clinic: formData.get('clinic') ?? '',
    plan: formData.get('plan') ?? 'emin-degilim',
    message: formData.get('message') ?? '',
    website: formData.get('website') ?? '',
  })

  if (!parsed.success) {
    const fieldErrors: PilotContactResult['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'website') {
        // Bal küpü dolu — bota geçerli bir hata bile döndürme.
        return { success: true }
      }
      if (field === 'name' || field === 'email' || field === 'clinic' || field === 'plan' || field === 'message') {
        fieldErrors[field] ??= issue.message
      }
    }
    return { success: false, error: 'Formda eksik ya da hatalı alanlar var.', fieldErrors }
  }

  const input = parsed.data
  if (input.website) return { success: true }

  const headerList = await headers()
  const ip = headerList.get('x-forwarded-for')?.split(',')[0]?.trim() || 'bilinmiyor'
  if (isRateLimited(ip)) {
    return {
      success: false,
      error: 'Kısa sürede çok fazla talep gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.',
    }
  }

  const to = process.env.NEXT_PUBLIC_PILOT_CONTACT_EMAIL?.trim()
  const subject = `Pilot talebi — ${input.name} (${PLAN_LABELS[input.plan]})`
  const lines = [
    `Ad: ${input.name}`,
    `E-posta: ${input.email}`,
    `Klinik: ${input.clinic || '—'}`,
    `İlgilendiği paket: ${PLAN_LABELS[input.plan]}`,
    '',
    input.message || '(mesaj yazılmadı)',
  ]
  const text = lines.join('\n')

  if (!to) {
    logger.warn(
      { plan: input.plan },
      'Pilot iletişim formu dolduruldu ama NEXT_PUBLIC_PILOT_CONTACT_EMAIL tanımlı değil — talep GÖNDERİLEMEDİ.',
    )
    return {
      success: false,
      error:
        'İletişim adresi bu ortamda henüz yapılandırılmadı, bu yüzden talebiniz gönderilemedi. Lütfen daha sonra tekrar deneyin.',
    }
  }

  try {
    await getEmailSender().send({
      to,
      subject,
      text,
      html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${lines
        .map((line) => line.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char))
        .join('\n')}</pre>`,
    })
    return { success: true }
  } catch (error) {
    logger.error(error instanceof Error ? error : new Error(String(error)), 'Pilot iletişim formu gönderilemedi.')
    return {
      success: false,
      error:
        'Talebiniz şu anda gönderilemedi. Lütfen aşağıdaki e-posta adresine doğrudan yazın ya da birkaç dakika sonra tekrar deneyin.',
    }
  }
}
