import 'server-only'
import { db } from '@ogun/db'
import { listClients, type ListClientsInput, type ListClientsResult } from '@ogun/db/queries'
import { withAuth } from '@/lib/authz'
import { withAudit } from '@/lib/audit'

// Danışan listesi okuması (GitHub issue #17 / Prompt 4.1, GÖREV 2) — bir
// server action DEĞİL (mutasyon değil, 'use server' pragma'sı yok), sadece
// withAuth(withAudit(...)) ile sarılmış normal bir sunucu fonksiyonu. Bu,
// apps/web/src/lib/data-subject-rights.ts'teki viewClientRecord ile AYNI
// desen — o dosyanın üstündeki not bu iki fonksiyonun (viewClientRecord,
// listClientsForClinic) Prompt 4.1 danışan sayfaları kurulduğunda
// "doğrudan kullanılabilir" olacağını zaten söylüyordu.
//
// Sağlık verisine erişim KVKK kapsamında denetlenmesi gereken bir okuma
// olduğu için (bkz. lib/audit.ts dosya başı notu) TEK bir danışanın
// görüntülenmesi kadar, bir LİSTE görüntülemesi de burada denetleniyor —
// ama entityId tek bir kayda işaret etmediği için null bırakılıyor, bunun
// yerine metadata'ya uygulanan filtreler + dönen satır sayısı yazılıyor.
export const listClientsForClinic = withAuth(
  withAudit(
    {
      action: 'read',
      entityType: 'client',
      metadata: ([input]: [ListClientsInput], result: ListClientsResult | undefined) => ({
        filters: input,
        resultCount: result?.rows.length,
      }),
    },
    async (ctx, input: ListClientsInput) => listClients(db, ctx.scope.clinicId, input),
  ),
)
