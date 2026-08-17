// GitHub issue #40 / Prompt 7.2 — GÖREV 2 "danışan cari hesabı" (paket
// geçmişi, ödemeler, kalan seans, BORÇ). finance-aggregation.ts'in
// clinic-genelindeki toplamlar yerine TEK bir danışanın bakiyesini hesaplar —
// aynı "sorgu ham veri getirir, apps/web/src/lib/billing hesaplar" ayrımı.

export interface ClientAccountPackage {
  price: string | number
}

export interface ClientAccountPayment {
  amount: string | number
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number(value)
}

export interface ClientAccountBalance {
  totalOwed: number
  totalPaid: number
  balance: number // > 0: danışanın borcu var, <= 0: borç yok/fazla ödeme
}

// Borç = TÜM satın alınan paketlerin (iptal edilenler HARİÇ, çağıran taraf
// zaten filtrelenmiş listeyi verir) toplam fiyatı - TÜM ödemeler. Paket dışı
// ödemeler (clientPackageId NULL, ör. tek seferlik danışmanlık ücreti)
// totalPaid'e dahil ama hiçbir paketin fiyatına karşılık gelmediği için
// borcu artırmaz, sadece azaltabilir — bu BİLİNÇLİ bir basitleştirme
// (roadmap "basit tut" kuralı): paket dışı ödemeler kendi başına bir
// alacak yaratmaz, sadece var olan paket borcunu kapatmaya sayılır.
export function calculateClientBalance(
  packages: readonly ClientAccountPackage[],
  payments: readonly ClientAccountPayment[],
): ClientAccountBalance {
  const totalOwed = packages.reduce((sum, pkg) => sum + toNumber(pkg.price), 0)
  const totalPaid = payments.reduce((sum, payment) => sum + toNumber(payment.amount), 0)
  return { totalOwed, totalPaid, balance: totalOwed - totalPaid }
}
