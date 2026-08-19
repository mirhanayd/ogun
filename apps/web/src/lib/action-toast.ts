import { toast } from 'sonner'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — "Sunucu action
// hatalarında toast metinleri Türkçe ve eyleme dönük olsun ('Bir hata
// oluştu' DEĞİL — ne olduğu ve ne yapılacağı)."
//
// Uygulamadaki hata bildirimleri ZATEN Türkçeydi ve NE OLDUĞUNU söylüyordu
// ("Gider kaydedilemedi."), ama NE YAPILACAĞINI söylemiyordu — kullanıcı
// tekrar mı denesin, alanı mı düzeltsin, destek mi arasın bilmiyordu. Bu
// yardımcı, ikinci yarıyı ZORUNLU bir parametre yaparak bunu tip seviyesinde
// garanti eder: `toastActionError(özet, ipucu)` — ipucu opsiyonel DEĞİL.
//
// ÇEVRİMDIŞI ÖZEL DURUMU: bağlantı yokken sunucu action'ı zaten HİÇ
// çalışmamıştır; "alanları kontrol edin" demek yanıltıcı olur. Bu durumda
// verilen ipucunun yerine bağlantı ipucu geçer (bkz. components/
// offline-indicator.tsx — aynı `navigator.onLine` bayrağı, aynı gerekçe:
// yanlış negatif vermez).
const OFFLINE_HINT =
  'İnternet bağlantınız yok. Bağlantı geri geldiğinde tekrar deneyin — bu işlem sunucuya hiç ulaşmadı.'

export function toastActionError(summary: string, hint: string): void {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  toast.error(summary, { description: offline ? OFFLINE_HINT : hint })
}
