import 'server-only'
import { db } from '@ogun/db'
import { insertAuditLog, type AuditLogInput } from '@ogun/db/queries'
import type { AuditAction } from '@ogun/db/schema'
import type { ClinicContext } from './authz'

// Otomatik denetim kaydı (GitHub issue #12 / Prompt 3.3). Sağlık verisi KVKK
// kapsamında özel nitelikli kişisel veri sayıldığı için, danışan verisine
// dokunan HER işlem — sadece create/update/delete DEĞİL, READ de — burada
// bir iz bırakmalı (bkz. schema/audit.ts üstündeki not).
//
// withAuth() (authz.ts) ile DOĞAL biçimde birleşir: withAuth zaten
// `(ctx, ...args) => Promise<Result>` şeklinde bir action alıp onu
// çağrılabilir bir server action'a çeviriyor. withAudit AYNI şekli koruyarak
// (bir ctx-action alır, bir ctx-action döner) araya girer — bu yüzden en dış
// katmanda withAuth, hemen içinde withAudit olacak şekilde zincirlenir:
//
//   export const exportClientData = withAuth(
//     withAudit(
//       { action: 'export', entityType: 'client', entityId: ([clientId]) => clientId },
//       async (ctx, clientId: string) => { ... },
//     ),
//   )
//
// Bu sıralama (withAudit İÇTE) withAuth'un ürettiği ClinicContext'i (dolayısıyla
// clinicId + userId) ekstra bir requireClinic() round-trip'i olmadan doğrudan
// kullanabilmeyi sağlıyor. Gerçek, çalışan örnekler için bkz.
// apps/web/src/lib/data-subject-rights.ts.
//
// Okuma (read) senaryosunda da AYNI wrapper kullanılır — "server action"
// olması şart değil, bir sayfa/bileşenin çağırdığı sıradan bir veri getirme
// fonksiyonu da withAuth(withAudit({ action: 'read', ... }, fetcher)) olarak
// sarmalanabilir (bkz. data-subject-rights.ts viewClientRecord).

export interface AuditDescriptor<Args extends unknown[], Result> {
  action: AuditAction
  entityType: string
  // Sonucu (veya başarısız olduysa undefined) argümanlardan/sonuçtan türetir.
  // Örn. create işleminde entityId genelde SONUÇTAN gelir (yeni oluşan id),
  // read/update/delete işleminde genelde İLK ARGÜMANDAN (çağrılan id).
  entityId?: (args: Args, result: Result | undefined) => string | null
  // Ek bağlam (ör. hangi alanlar değişti, kaç kayıt dışa aktarıldı vb.).
  metadata?: (args: Args, result: Result | undefined) => Record<string, unknown> | undefined
}

export interface AuditRecorder {
  (input: AuditLogInput): Promise<void>
}

// Gerçek kayıt: packages/db'ye yazar + next/headers'tan ip/user-agent okur.
// next/headers İÇE AKTARIMI (import) burada DEĞİL, fonksiyon gövdesinde,
// dinamik olarak yapılıyor — bilerek: withAudit'in test edilebilmesi için
// (bkz. audit.test.ts) recorder enjekte edilebiliyor ve testler bu fonksiyonu
// HİÇ çağırmıyor; next/headers'ın gerektirdiği bir istek bağlamı (request
// scope) olmadan da withAudit'in asıl mantığı (ne zaman/hangi veriyle
// çağrıldığı) izole test edilebiliyor.
async function defaultRecorder(input: AuditLogInput): Promise<void> {
  const { headers } = await import('next/headers')
  const requestHeaders = await headers()
  await insertAuditLog(db, {
    ...input,
    ipAddress: requestHeaders.get('x-forwarded-for') ?? requestHeaders.get('x-real-ip'),
    userAgent: requestHeaders.get('user-agent'),
  })
}

// Bir ctx-action'ı (withAuth'un beklediği şekil) denetim kaydıyla sarmalar.
// `recorder` parametresi test amaçlı enjeksiyon İÇİNDİR — normal kullanımda
// hiç verilmez, gerçek DB yazımı (defaultRecorder) kullanılır.
export function withAudit<Args extends unknown[], Result>(
  descriptor: AuditDescriptor<Args, Result>,
  action: (ctx: ClinicContext, ...args: Args) => Promise<Result>,
  recorder: AuditRecorder = defaultRecorder,
): (ctx: ClinicContext, ...args: Args) => Promise<Result> {
  return async (ctx: ClinicContext, ...args: Args): Promise<Result> => {
    let result: Result | undefined
    let caught: unknown
    let hasError = false

    try {
      result = await action(ctx, ...args)
      return result
    } catch (error) {
      caught = error
      hasError = true
      throw error
    } finally {
      const baseMetadata = descriptor.metadata?.(args, result)
      const metadata = hasError
        ? { ...baseMetadata, error: caught instanceof Error ? caught.message : String(caught) }
        : baseMetadata

      try {
        await recorder({
          clinicId: ctx.scope.clinicId,
          userId: ctx.user.id,
          action: descriptor.action,
          entityType: descriptor.entityType,
          entityId: descriptor.entityId?.(args, result) ?? null,
          metadata,
        })
      } catch (auditError) {
        // Denetim kaydının YAZILAMAMASI, asıl klinik işlemini (ör. bir diyet
        // planını kaydetmeyi) engellemez — log altyapısı geçici olarak
        // arızalansa bile diyetisyen işine devam edebilmeli. Ama bu hata
        // sessizce yutulmaz, sunucu loguna düşer (ileride: alerting/izleme
        // ayrı bir altyapı issue'sunun kapsamında olabilir).
        console.error('[audit] Denetim kaydı yazılamadı:', auditError)
      }
    }
  }
}
