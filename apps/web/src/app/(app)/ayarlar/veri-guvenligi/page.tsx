import { db } from '@ogun/db'
import { getClinicById, listRecentAuditLogsForClinic } from '@ogun/db/queries'
import type { AuditAction } from '@ogun/db/schema'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requireClinic } from '@/lib/authz'
import { DataRetentionForm } from './data-retention-form'

const ACTION_LABELS_TR: Record<AuditAction, string> = {
  create: 'Oluşturma',
  read: 'Görüntüleme',
  update: 'Güncelleme',
  delete: 'Silme',
  export: 'Dışa aktarma',
}

const RECENT_LOGS_LIMIT = 50

// /ayarlar/veri-guvenligi — GitHub issue #12 / Prompt 3.3, GÖREV 4. /ayarlar
// ana sayfasından bağlanan bir alt sayfa (nested route), aynı /ayarlar nav
// öğesinin rol kısıtını (owner, dietitian) tekrar sunucu tarafında da uygular
// — nav gizleme tek başına bir güvenlik sınırı değildir.
export default async function VeriGuvenligiPage() {
  const { scope, role } = await requireClinic()
  if (role !== 'owner') redirect('/ayarlar')

  // NOT: bu sayfanın kendi audit_logs okuması withAudit() ile denetlenMİYOR —
  // audit_logs klinik-yönetimi meta verisidir, danışan sağlık verisi değil
  // (bkz. queries/clinics.ts üstündeki "tenancy yönetimi vs. danışan verisi"
  // ayrımı). Aksi halde her denetim kaydı görüntülemesi kendi kaydını üretir
  // ve anlamsız bir döngüye girerdi.
  const [clinic, recentLogs] = await Promise.all([
    getClinicById(db, scope.clinicId),
    listRecentAuditLogsForClinic(db, scope.clinicId, RECENT_LOGS_LIMIT),
  ])

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Veri saklama süresi</CardTitle>
          <CardDescription>
            Danışan verisinin klinikte varsayılan olarak saklanacağı süre. Kesin süre, KVKK uyum
            sürecinde ürün sahibi/hukuk ekibi tarafından ayrıca belirlenecektir — bu sadece teknik bir
            varsayılan ayardır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataRetentionForm defaultValues={{ dataRetentionDays: clinic?.dataRetentionDays ?? 3650 }} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Son erişim kayıtları</CardTitle>
          <CardDescription>
            Bu klinikteki danışan verisine yapılan son işlemler (görüntüleme dahil) — sağlık verisi
            özel nitelikli kişisel veri sayıldığı için erişim de kayıt altına alınır.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz bir denetim kaydı yok. Danışan modülü (Prompt 4.1) devreye girdikçe burası dolacak.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>İşlem</TableHead>
                  <TableHead>Varlık</TableHead>
                  <TableHead>IP adresi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {log.createdAt.toLocaleString('tr-TR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ACTION_LABELS_TR[log.action]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.entityType}
                      {log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.ipAddress ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
import { redirect } from 'next/navigation'
