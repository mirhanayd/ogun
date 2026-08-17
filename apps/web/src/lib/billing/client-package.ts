// GitHub issue #40 / Prompt 7.2 — GÖREV 2 "kalan seans 1'e düşünce randevu
// ekranında uyarı" gerektiren SAF (DB/React'tan habersiz) hesap mantığı.
// scheduling.ts (GitHub issue #39) ile AYNI gerekçe: bu fonksiyonlar düz
// girdi/çıktı olarak test edilebilsin diye bileşenlerden/sorgulardan AYRI
// tutuluyor (bkz. client-package.test.ts).

export interface ClientPackageForWarning {
  sessionCount: number
  sessionsUsed: number
  status: 'aktif' | 'tamamlandı' | 'süresi_doldu' | 'iptal'
  expiresAt: Date | null
}

// Kalan seans sayısı — negatife düşmez (sessionsUsed teorik olarak
// sessionCount'u aşamaz, consumeClientPackageSession bunu garanti eder, ama
// UI tarafında savunmacı programlama İÇİN Math.max ile sıfırda kilitleniyor).
export function remainingSessions(pkg: Pick<ClientPackageForWarning, 'sessionCount' | 'sessionsUsed'>): number {
  return Math.max(0, pkg.sessionCount - pkg.sessionsUsed)
}

// Paketin (expiresAt geçmişse) GÖRÜNEN durumu — DB'deki status alanı henüz
// güncellenmemiş olsa bile (bkz. schema/billing.ts clientPackageStatusEnum
// üstündeki not: otomatik bir cron yok) ekranda "süresi doldu" gösterilir.
export function resolveDisplayStatus(
  pkg: Pick<ClientPackageForWarning, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): ClientPackageForWarning['status'] {
  if (pkg.status === 'aktif' && pkg.expiresAt !== null && pkg.expiresAt.getTime() < now.getTime()) {
    return 'süresi_doldu'
  }
  return pkg.status
}

// "Kalan seans 1'e düşünce randevu ekranında uyarı" (roadmap GÖREV 2, bire
// bir) — sadece GERÇEKTEN aktif (süresi dolmamış) bir pakette anlamlı,
// tamamlanmış/iptal edilmiş bir paket için uyarı gösterilmez.
export function isLowSessionWarning(pkg: ClientPackageForWarning, now: Date = new Date()): boolean {
  if (resolveDisplayStatus(pkg, now) !== 'aktif') return false
  return remainingSessions(pkg) === 1
}

export function lowSessionWarningMessage(clientName: string, pkg: ClientPackageForWarning): string {
  return `${clientName} için son 1 seans kaldı (${pkg.sessionsUsed}/${pkg.sessionCount} kullanıldı). Yeni paket satışını unutmayın.`
}
