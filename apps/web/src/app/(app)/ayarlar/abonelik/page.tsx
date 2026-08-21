import { redirect } from 'next/navigation'

// Abonelik ürünü şimdilik kullanıcı yüzeyinden kaldırıldı. Eski yer imleri
// güvenli biçimde genel ayarlara döner; altyapı tabloları ileride tekrar
// değerlendirilebilmesi için veri kaybına yol açacak bir migration ile silinmez.
export default function AbonelikAyarlariPage() {
  redirect('/ayarlar')
}
