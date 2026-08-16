import 'server-only'
import { db } from '@ogun/db'
import { getClientById, listAuditLogsForEntity, softDeleteClient } from '@ogun/db/queries'
import { withAuth } from './authz'
import { withAudit } from './audit'

// Veri sahibi hakları altyapısı (GitHub issue #12 / Prompt 3.3 — GÖREV 4):
// taşınabilirlik hakkı (dışa aktarma) + silme hakkı (soft delete + 30 günlük
// kalıcı silme kuyruğu). clients tablosu artık gerçek bir üretim çağrı
// noktasına sahip: viewClientRecord, GitHub issue #17 / Prompt 4.1'in
// danışan detay sayfası (app/(app)/danisanlar/[id]/page.tsx) tarafından
// DOĞRUDAN kullanılıyor. exportClientData/deleteClient ise hâlâ bir UI'a
// bağlı DEĞİL (dışa aktarma/silme talebi ekranı bu issue'nun kapsamında
// yok) — withAuth()+withAudit() kompozisyonunun çalışan örnekleri olarak
// kalmaya devam ediyorlar, ileride bir "veri sahibi hakları" ayarlar
// sayfasına bağlanabilirler.

// --- Okuma (READ) örneği ----------------------------------------------------
// Sağlık verisine erişim logu tutmak KVKK açısından önemli — bu yüzden salt
// bir görüntüleme bile withAudit(action:'read') ile sarmalanıyor.
export const viewClientRecord = withAuth(
  withAudit(
    { action: 'read', entityType: 'client', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => getClientById(db, ctx.scope.clinicId, clientId),
  ),
)

// --- Taşınabilirlik hakkı: JSON dışa aktarma --------------------------------
export interface ClientDataExport {
  exportedAt: string
  client: NonNullable<Awaited<ReturnType<typeof getClientById>>>
  accessLogs: Awaited<ReturnType<typeof listAuditLogsForEntity>>
}

// Danışanın verisini tek parça JSON olarak döner (veri taşınabilirliği hakkı,
// KVKK m.11). clients tablosunda bugün SADECE kimlik + rıza + silme alanları
// olduğu için çıktı şimdilik dar — ileride client_health, measurements,
// diet_plans vb. eklendikçe bu fonksiyon aynı desenle (ilgili tablonun
// clinicId+clientId'ye göre sorgusu + sonuca ekleme) genişler, yapısı buna
// göre kuruldu (düz bir "client" alanı + ek varlık dizileri).
//
// PDF çıktısı: bu issue kapsamında YOK. @react-pdf/renderer henüz hiçbir
// pakette kurulu değil (bkz. package.json'lar) — o, roadmap'in Prompt 6.1'i
// (PDF üretimi, packages/pdf) kapsamında gelecek. O paket kurulduğunda bu
// fonksiyonun döndürdüğü düz JSON, PDF şablonuna doğrudan girdi olarak
// verilebilecek şekilde tasarlandı.
//
// Dışa aktarma işleminin KENDİSİ de bir erişim kaydı doğurur (action:'export')
// — yani bu fonksiyon kendi çalışmasını da denetler.
export const exportClientData = withAuth(
  withAudit(
    { action: 'export', entityType: 'client', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string): Promise<ClientDataExport> => {
      const client = await getClientById(db, ctx.scope.clinicId, clientId)
      if (!client) {
        throw new Error('Danışan bulunamadı.')
      }
      const accessLogs = await listAuditLogsForEntity(db, 'client', clientId)
      return { exportedAt: new Date().toISOString(), client, accessLogs }
    },
  ),
)

// --- Silme hakkı: soft delete + kalıcı silme kuyruğu ------------------------
// Sadece owner/dietitian silebilir — assistant rolü danışan verisini
// silemez (bkz. authz.ts requireRole, nav-items.ts'deki benzer rol kısıtı).
// Gerçek kalıcı silme (30 gün sonra) bu fonksiyonda YAPILMAZ, sadece kuyruğa
// alınır — bkz. @ogun/db/queries findClientsPastDeletionGracePeriod
// üstündeki not (bunu tüketecek bir cron/worker henüz kurulu değil).
export const deleteClient = withAuth(
  withAudit(
    { action: 'delete', entityType: 'client', entityId: ([clientId]: [string]) => clientId },
    async (ctx, clientId: string) => softDeleteClient(db, ctx.scope.clinicId, clientId),
  ),
  ['owner', 'dietitian'],
)
