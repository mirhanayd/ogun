// GitHub issue #40 / Prompt 7.2 — GÖREV 3 "Finans paneli" için SAF aggregasyon
// mantığı. client-package.ts ile AYNI gerekçe: DB sorgusu (queries/billing.ts)
// sadece ham satırları getirir, toplama/gruplama BURADA — testler gerçek bir
// veritabanı bağlantısı gerektirmeden çalışır (bkz. finance-aggregation.test.ts).
// "Basit tut, detaylı raporlama v2" kuralı (roadmap) gereği BİLEREK tek bir
// genel raporlama motoru değil, üç ayrı küçük fonksiyon.

export interface PaymentForAggregation {
  amount: string | number
  paidAt: Date
  dietitianId: string | null
  dietitianName: string | null
}

export interface ExpenseForAggregation {
  amount: string | number
  date: string
}

export interface ClientPackageForReceivables {
  id: string
  price: string | number
  status: 'aktif' | 'tamamlandı' | 'süresi_doldu' | 'iptal'
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

// Aylık gelir/gider — payments/expenses ÇAĞIRAN tarafından ZATEN o aya
// filtrelenmiş olarak verilir (bkz. queries/billing.ts listPaymentsForClinicInRange
// / listExpensesForClinicInRange, [from, to) aralığı /finans sayfasında ay
// başı/sonu olarak hesaplanır) — bu fonksiyon SADECE toplar, tarih
// filtrelemesi YAPMAZ (çağıran taraf zaten doğru satırları getirdi).
export function monthlyIncomeExpense(
  payments: readonly PaymentForAggregation[],
  expenses: readonly ExpenseForAggregation[],
): { income: number; expense: number; net: number } {
  const income = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  const expense = expenses.reduce((sum, item) => sum + toNumber(item.amount), 0)
  return { income, expense, net: income - expense }
}

export interface DietitianRevenue {
  dietitianId: string
  dietitianName: string
  total: number
}

// Diyetisyen bazlı ciro (GÖREV 3, "çoklu diyetisyen kliniklerde") — ödemenin
// KENDİSİNDE bir dietitianId yok, danışanın atanan diyetisyeni kullanılır
// (bkz. queries/billing.ts listPaymentsForClinicInRange notu, "basit tut"
// kuralı). Atanmamış danışanların ödemeleri 'Atanmamış' altında toplanır —
// SESSIZCE atlanmaz, aksi halde toplam gelirle diyetisyen toplamları
// birbirini TUTMAZ.
export function revenueByDietitian(payments: readonly PaymentForAggregation[]): DietitianRevenue[] {
  const totals = new Map<string, DietitianRevenue>()
  for (const payment of payments) {
    const key = payment.dietitianId ?? 'unassigned'
    const name = payment.dietitianId ? (payment.dietitianName ?? 'Bilinmeyen') : 'Atanmamış'
    const existing = totals.get(key)
    const amount = toNumber(payment.amount)
    if (existing) {
      existing.total += amount
    } else {
      totals.set(key, { dietitianId: key, dietitianName: name, total: amount })
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.total - a.total)
}

// Tahsil edilmemiş alacaklar (GÖREV 3) — her client_package için (price -
// o pakete ait ödemeler toplamı), sadece POZİTİF farklar toplanır (fazla
// ödeme bir "negatif alacak" olarak toplam alacağı AZALTMAZ, roadmap'in
// "basit tut" ruhuna göre bu kadar detay v2'ye bırakıldı). 'iptal' edilen
// paketler zaten queries/billing.ts listClientPackagesForClinic'te
// filtrelenip BURAYA hiç gelmiyor.
export function uncollectedReceivables(
  clientPackages: readonly ClientPackageForReceivables[],
  paymentsByClientPackageId: ReadonlyMap<string, number>,
): number {
  let total = 0
  for (const pkg of clientPackages) {
    const paid = paymentsByClientPackageId.get(pkg.id) ?? 0
    const owed = toNumber(pkg.price) - paid
    if (owed > 0) total += owed
  }
  return total
}

// listPaymentsForClientPackages (queries/billing.ts) düz bir satır listesi
// döner — uncollectedReceivables'ın ihtiyaç duyduğu clientPackageId → toplam
// map'ine burada dönüştürülür (sorgu katmanında GROUP BY yerine burada
// toplanması, "aggregasyon her zaman apps/web/src/lib/billing'de" kuralıyla
// tutarlı).
export function sumPaymentsByClientPackage(
  payments: readonly { clientPackageId: string | null; amount: string | number }[],
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const payment of payments) {
    if (!payment.clientPackageId) continue
    totals.set(payment.clientPackageId, (totals.get(payment.clientPackageId) ?? 0) + toNumber(payment.amount))
  }
  return totals
}
