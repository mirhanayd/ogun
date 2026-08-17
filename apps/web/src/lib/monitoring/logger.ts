import pino from 'pino'
import { scrubPiiFromText, scrubValue } from './pii-scrub'

// GitHub issue #45 / Prompt 8.1, GÖREV 1 — "Sunucu tarafı yapılandırılmış
// loglama (pino). Sağlık verisi loglara SIZMASIN." pii-scrub.ts'teki AYNI
// kural motoru burada da kullanılıyor (sentry.ts ile TEK kaynak, bkz. o
// dosyanın başındaki not) — pino'nun kendi `redact` seçeneği SADECE bilinen,
// SABİT yol (path) listeleriyle çalışır (ör. "req.headers.cookie"); bizim
// riskimiz ise KEYFİ bir log çağrısına (`logger.info({ client }, ...)`)
// tüm bir danışan objesinin yanlışlıkla geçirilmesi — bu yüzden pino'nun
// `hooks.logMethod` genişletme noktası kullanılarak HER log çağrısının
// argümanları, pino'ya ulaşmadan önce scrubValue/scrubPiiFromText'ten
// geçiriliyor. Bu, "biri unutup client objesini loglarsa ne olur" sorusuna
// karşı asıl güvenlik ağı.
function scrubLogArgs(args: unknown[]): unknown[] {
  if (args.length === 0) return args
  const [first, ...rest] = args

  // pino çağrı imzası iki şekilde gelir: logger.info(mergeObject, msg?) veya
  // logger.info(msg, ...interpolationArgs). Error örnekleri (ör.
  // logger.error(err, 'mesaj')) BİLEREK dokunulmadan bırakılıyor — stack
  // trace/hata mesajı kırpılırsa hata ayıklama imkânsızlaşır VE Error
  // nesneleri zaten danışan verisi taşıyan bir "mergeObject" ŞEKLİNDE
  // değildir (bkz. aşağıdaki `instanceof Error` istisnası).
  if (first instanceof Error) {
    return args
  }

  if (first !== null && typeof first === 'object') {
    return [scrubValue(first, undefined), ...rest]
  }

  if (typeof first === 'string') {
    return [scrubPiiFromText(first), ...rest]
  }

  return args
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Geliştirmede insan-okunur renkli çıktı (pino-pretty), üretimde ham JSON
  // (log toplayıcıya — ör. bir merkezi log sistemine — dosturulur).
  transport:
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
  hooks: {
    logMethod(inputArgs, method) {
      method.apply(this, scrubLogArgs(inputArgs) as Parameters<typeof method>)
    },
  },
})

// GÖREV 1'in "request/response logging middleware" isteği — Next.js App
// Router'da global bir middleware.ts YOK (bu issue'nun kapsamı DIŞINDA,
// bkz. Prompt 8.2'nin env/deploy kapsamı), bu yüzden route bazlı bir
// sarmalayıcı (withAuth/withAudit ile AYNI "yüksek mertebeli fonksiyon"
// deseni) kullanılıyor. apps/web/src/app/api/foods/search/route.ts gibi
// route handler'lara uygulanır (bkz. o dosya).
//
// Loglanan alanlar BİLEREK dar: HTTP metodu, path, status code, süre (ms).
// Request/response GÖVDESİ (body) hiç loglanmaz — bir arama sorgusu bile
// (ör. "q=fıstık alerjisi olan tarif") dolaylı sağlık verisi taşıyabileceği
// için varsayılan olarak KAPALI, gövde loglamak isteyen bir çağrı noktası
// `extra` parametresiyle KENDİ seçtiği (ve scrubValue'dan otomatik geçen)
// alanları ekleyebilir.
export function withRequestLogging<Args extends unknown[]>(
  routeName: string,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    const startedAt = performance.now()
    try {
      const response = await handler(...args)
      logger.info({
        route: routeName,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      })
      return response
    } catch (error) {
      logger.error(
        {
          route: routeName,
          durationMs: Math.round(performance.now() - startedAt),
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        'İstek işlenirken hata oluştu',
      )
      throw error
    }
  }
}
