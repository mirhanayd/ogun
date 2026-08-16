// Doğum tarihinden (YYYY-MM-DD) yaş hesaplar. Sunucu/istemci ayrımı olmayan
// saf bir fonksiyon — hem danışan listesi tablosunda (bkz.
// app/(app)/danisanlar/clients-table.tsx "yaş" kolonu) hem de detay
// sayfasındaki özet kartta (bkz. app/(app)/danisanlar/[id]/page.tsx)
// kullanılır. birthDate NULL/boş olabilir (hızlı kayıt formunda doldurulması
// ZORUNLU değil, bkz. lib/validation/client-schemas.ts) — bu durumda yaş de
// gösterilemez, null döner.
// DİKKAT (UTC kullanımı BİLEREK): 'YYYY-MM-DD' biçimindeki bir dize
// `new Date(...)`'e verildiğinde ECMA-262 gereği UTC gece yarısı olarak
// ayrıştırılır. Karşılaştırmayı da (today için) getFullYear/getMonth/getDate
// (YEREL saat dilimi) yerine getUTC* ile yapmak, sunucunun çalıştığı saat
// dilimine göre sonucun kayması ihtimalini (ör. testler CI'da farklı bir
// TZ'de çalıştığında ±1 gün kayması) tamamen ortadan kaldırıyor — doğum
// tarihi zaten saatsiz bir takvim günü (bkz. schema/clients.ts birthDate,
// pg `date` tipi), yaş hesabının hangi saat diliminde çalıştığına bağlı
// olmaması gerekir.
export function calculateAge(birthDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!birthDate) return null

  const parsed = new Date(birthDate)
  if (Number.isNaN(parsed.getTime())) return null
  if (parsed.getTime() > today.getTime()) return null // gelecekteki bir doğum tarihi geçersizdir

  let age = today.getUTCFullYear() - parsed.getUTCFullYear()
  const monthDiff = today.getUTCMonth() - parsed.getUTCMonth()
  const dayDiff = today.getUTCDate() - parsed.getUTCDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }
  return age
}
