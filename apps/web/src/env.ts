import { z } from 'zod'

// GitHub issue #46 / Prompt 8.2, GÖREV 1 — "Zod ile env doğrulama, eksik
// değişkenle uygulama başlamasın." Bu dosya uygulamanın gerçekten okuduğu
// TÜM process.env değişkenlerinin TEK doğrulama noktasıdır (bkz.
// docs/deployment.md "Ortam değişkenleri" bölümü — .env.example'daki her
// satırın buradaki bir alanla birebir eşleştiği doğrulanmıştır).
//
// KURAL: Vercel'e özel bir mekanizma değil (mimari kural #6) — düz
// process.env okur, Docker/plain Node/Vercel fark etmeksizin aynı şekilde
// çalışır. instrumentation.ts'in register() fonksiyonu bu modülü sunucu
// başlarken (next dev / next start) çağırır — next build SIRASINDA
// register() ÇALIŞMAZ (Next.js sadece next dev/next start'ta sunucu
// instance'ı başlatırken çağırır), bu yüzden CI/build ortamında eksik
// prod-only değişkenler build'i BOZMAZ.
//
// ORTAMLAR (local | staging | production):
// - local: sadece "her zaman zorunlu" alanlar gerekir (aşağıdaki
//   ALWAYS_REQUIRED şeması). RESEND/SENTRY gibi dış servisler boş
//   bırakılabilir, ilgili özellik (e-posta gönderimi, hata izleme) o zaman
//   sessizce devre dışı kalır (bkz. resend-sender.ts / sentry.ts).
// - staging / production: yukarıdakilere EK olarak RESEND_API_KEY ve
//   RESEND_FROM_EMAIL zorunludur — plan paylaşım e-postası (#36) canlıda
//   çalışmayan bir özellik olarak dağıtılmamalı. Hangi ortamda olduğumuzu
//   APP_ENV belirler (SENTRY_ENVIRONMENT ile AYNI "boşsa NODE_ENV'e düş"
//   deseni, bkz. sentry.ts getSentryEnvironment).
//
// NOT — Sentry BİLEREK production'da da zorunlu TUTULMADI: #45'te alınan
// ürün kararı (bkz. .env.example ve sentry.ts dosya başı notları) Sentry'nin
// DSN yokken sessizce no-op olmasıdır ("bu değişkenler zorunlu DEĞİL").
// Bu davranışı env.ts'te "production'da zorunlu" yaparak GERİYE DÖNÜK
// çelişkiye sokmuyoruz; SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN her ortamda
// opsiyonel kalır, sadece docs/deployment.md'de "production'da GÜÇLÜ ÖNERİ"
// olarak belirtilir.
export type AppEnvironment = 'local' | 'staging' | 'production'

function resolveAppEnvironment(raw: NodeJS.ProcessEnv): AppEnvironment {
  const explicit = raw.APP_ENV
  if (explicit === 'local' || explicit === 'staging' || explicit === 'production') {
    return explicit
  }
  return raw.NODE_ENV === 'production' ? 'production' : 'local'
}

const urlOrLocalhost = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      return Boolean(new URL(value))
    } catch {
      return false
    }
  }, 'geçerli bir URL olmalı (ör. http://localhost:3000)')

const alwaysRequiredSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL zorunlu — postgresql://kullanici:sifre@host:port/veritabani formatında olmalı.'),
  BETTER_AUTH_SECRET: z
    .string()
    .min(1, 'BETTER_AUTH_SECRET zorunlu — `openssl rand -base64 32` ile üretilebilir.'),
  BETTER_AUTH_URL: urlOrLocalhost,
  NEXT_PUBLIC_BETTER_AUTH_URL: urlOrLocalhost,
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT zorunlu — dosya yükleme (#19) bu değişken olmadan çalışmaz.'),
  S3_BUCKET: z.string().min(1, 'S3_BUCKET zorunlu.'),
  S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID zorunlu.'),
  S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY zorunlu.'),
})

const optionalSchema = z.object({
  S3_REGION: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  // Google OAuth ikisi birden ya da hiçbiri olmalı (bkz. superRefine altta) —
  // auth.ts ikisini de `?? ''` ile okuyor, tek biri boşsa OAuth sessizce
  // yanlış yapılandırılmış olur; bunu erken yakalıyoruz.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  APP_ENV: z.enum(['local', 'staging', 'production']).optional(),
  // GitHub issue #60 / Faz 10, Prompt 10.2 — landing sayfası.
  // Sitenin herkese açık kök adresi; canonical, sitemap.xml ve OpenGraph
  // görselinin mutlak URL'leri buradan türetilir (bkz. lib/site-url.ts).
  // HER ORTAMDA OPSİYONEL: eksikse uygulama BAŞLAR, sadece bu URL'ler
  // localhost'u gösterir — bir pazarlama metadata'sı eksikliği bir kliniğin
  // uygulamayı açmasını engellememeli. Üretimde doldurulması docs/
  // deployment.md'de GÜÇLÜ ÖNERİ olarak işaretli (SENTRY_DSN ile aynı
  // muamele, bkz. dosya başındaki not).
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
  // Pilot iletişim formunun (landing → "Pilot için başvur") talebi
  // gönderdiği ve sayfada gösterilen e-posta adresi. Boşken form AÇIK bir
  // hata döndürür, talebi SESSİZCE KAYBETMEZ (bkz. app/_landing/actions.ts).
  NEXT_PUBLIC_PILOT_CONTACT_EMAIL: z.string().optional(),
  IYZICO_API_KEY: z.string().optional(),
  IYZICO_SECRET_KEY: z.string().optional(),
  IYZICO_BASE_URL: z.string().optional(),
  IYZICO_SINGLE_MONTHLY_PLAN_REFERENCE_CODE: z.string().optional(),
  IYZICO_SINGLE_YEARLY_PLAN_REFERENCE_CODE: z.string().optional(),
  IYZICO_TEAM_MONTHLY_PLAN_REFERENCE_CODE: z.string().optional(),
  IYZICO_TEAM_YEARLY_PLAN_REFERENCE_CODE: z.string().optional(),
})

const envShape = alwaysRequiredSchema.merge(optionalSchema)
export type Env = z.infer<typeof envShape>

function buildSchema(appEnvironment: AppEnvironment) {
  return envShape.superRefine((value, ctx) => {
    const hasGoogleId = Boolean(value.GOOGLE_CLIENT_ID)
    const hasGoogleSecret = Boolean(value.GOOGLE_CLIENT_SECRET)
    if (hasGoogleId !== hasGoogleSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'GOOGLE_CLIENT_ID ve GOOGLE_CLIENT_SECRET birlikte tanımlanmalı (Google girişi yarım yapılandırılmış olamaz) — ikisini de doldurun ya da ikisini de boş bırakın.',
        path: ['GOOGLE_CLIENT_ID'],
      })
    }

    if (appEnvironment !== 'local') {
      const requiredIyzicoFields = [
        'IYZICO_API_KEY',
        'IYZICO_SECRET_KEY',
        'IYZICO_BASE_URL',
        'IYZICO_SINGLE_MONTHLY_PLAN_REFERENCE_CODE',
        'IYZICO_SINGLE_YEARLY_PLAN_REFERENCE_CODE',
        'IYZICO_TEAM_MONTHLY_PLAN_REFERENCE_CODE',
        'IYZICO_TEAM_YEARLY_PLAN_REFERENCE_CODE',
      ] as const
      for (const field of requiredIyzicoFields) {
        if (!value[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field}, ${appEnvironment} ortamında zorunlu — iyzico abonelik akışı eksik yapılandırılamaz.`,
            path: [field],
          })
        }
      }
      if (!value.RESEND_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `RESEND_API_KEY, ${appEnvironment} ortamında zorunlu — plan paylaşım e-postası (#36) canlıda çalışır olmalı.`,
          path: ['RESEND_API_KEY'],
        })
      }
      if (!value.RESEND_FROM_EMAIL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `RESEND_FROM_EMAIL, ${appEnvironment} ortamında zorunlu.`,
          path: ['RESEND_FROM_EMAIL'],
        })
      }
    }
  })
}

// Doğrulama sonucunu okunaklı, hangi değişkenin eksik/hatalı olduğunu AÇIKÇA
// söyleyen bir Error'a çevirir — "uygulama başlamasın" isteğinin karşılığı
// budur: process bu Error ile çöker, log'da tam olarak hangi env eksik yazar.
export function validateEnv(
  source: NodeJS.ProcessEnv = process.env,
): { success: true; env: Env } | { success: false; message: string } {
  const appEnvironment = resolveAppEnvironment(source)
  const result = buildSchema(appEnvironment).safeParse(source)
  if (result.success) {
    return { success: true, env: result.data }
  }
  const lines = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
  const message = [
    `Ortam değişkeni doğrulaması başarısız (APP_ENV=${appEnvironment}). Uygulama başlatılamıyor:`,
    ...lines,
    'Bkz. .env.example ve docs/deployment.md "Ortam değişkenleri" bölümü.',
  ].join('\n')
  return { success: false, message }
}

// Sunucu başlarken (bkz. instrumentation.ts) çağrılır — başarısızsa process'i
// throw ile durdurur, "eksik değişkenle uygulama başlamasın" kuralının
// uygulaması budur.
export function assertValidEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = validateEnv(source)
  if (!result.success) {
    throw new Error(result.message)
  }
  return result.env
}
