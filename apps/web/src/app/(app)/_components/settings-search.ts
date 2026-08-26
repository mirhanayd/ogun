import {
  Building2,
  Clock3,
  MessageSquareText,
  MonitorSmartphone,
  Palette,
  Phone,
  Share2,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { ClinicMemberRole } from '@ogun/db/schema'

// Header'daki global aramanın (command-palette.tsx) "Ayarlar" yarısı.
//
// NEDEN STATİK BİR LİSTE: ayar sayfaları sunucuda çizilen kartlardan ibaret;
// tek tek ayarların kendisi ayrı API uçlarına sahip değil. Kullanıcı "marka
// rengi" yazdığında onu doğru sayfaya götürmek için gereken şey bir veri
// kaynağı değil, BİR KEZ tanımlanmış bir harita. Yeni bir ayar kartı
// eklendiğinde buraya bir satır eklemek yeterli — palet otomatik görür.
//
// `keywords`, cmdk'nın fuzzy filtresinin eşleyeceği ek terimlerdir
// (bkz. command-palette.tsx'teki searchValue birleşimi); kullanıcı ayarın
// arayüzdeki etiketini bilmese de "sms", "whatsapp", "kvkk" gibi günlük
// kelimelerle bulabilsin diye varlar.
export interface SettingsSearchEntry {
  id: string
  label: string
  description: string
  /** Arama eşleşmesinde etikete EKlenen serbest terimler. */
  keywords: string
  icon: LucideIcon
  href: string
  /** bölüm = ayar sayfasındaki bir kart/başlık; ayar = o bölümün içindeki tekil alan. */
  kind: 'bölüm' | 'ayar'
  /** Belirtilmezse Ayarlar'ı gören her rol (owner, dietitian) arar. */
  requiredRole?: ClinicMemberRole[]
}

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  {
    id: 'setting-klinik-kimligi',
    label: 'Klinik kimliği',
    description: 'Klinik adı, logo, telefon ve adres bilgileri',
    keywords: 'klinik bilgileri logo iletişim kurum',
    icon: Building2,
    href: '/ayarlar',
    kind: 'bölüm',
  },
  {
    id: 'setting-klinik-adi',
    label: 'Klinik adı',
    description: 'Belgelerde ve danışan iletişiminde görünen ad',
    keywords: 'klinik kurum adı isim',
    icon: Building2,
    href: '/ayarlar',
    kind: 'ayar',
  },
  {
    id: 'setting-klinik-logosu',
    label: 'Klinik logosu',
    description: 'Plan paylaşımında ve klinik belgelerinde kullanılan görsel',
    keywords: 'logo görsel marka resim',
    icon: Building2,
    href: '/ayarlar',
    kind: 'ayar',
  },
  {
    id: 'setting-klinik-telefonu',
    label: 'Klinik telefonu',
    description: 'Danışan iletişiminde kullanılan numara',
    keywords: 'telefon numara iletişim ara',
    icon: Phone,
    href: '/ayarlar',
    kind: 'ayar',
  },
  {
    id: 'setting-marka-rengi',
    label: 'Marka rengi',
    description: 'Uygulamanın ve paylaşılan planların vurgu rengi',
    keywords: 'tema renk marka görünüm primary',
    icon: Palette,
    href: '/ayarlar',
    kind: 'ayar',
  },
  {
    id: 'setting-klinik-adresi',
    label: 'Klinik adresi',
    description: 'Kliniğin açık adresi',
    keywords: 'adres konum yer harita',
    icon: Building2,
    href: '/ayarlar',
    kind: 'ayar',
  },
  {
    id: 'setting-calisma-saatleri',
    label: 'Çalışma saatleri',
    description: 'Randevu uygunluğu için kullanılan haftalık düzen',
    keywords: 'mesai saat kapalı günler haftalık randevu uygunluk takvim',
    icon: Clock3,
    href: '/ayarlar',
    kind: 'bölüm',
  },
  {
    id: 'setting-ekip-ve-yetkiler',
    label: 'Ekip ve yetkiler',
    description: 'Diyetisyen davetlerini gönderin, kurum erişimlerini görün',
    keywords: 'ekip takım üye davet diyetisyen rol yetki personel',
    icon: UsersRound,
    href: '/ayarlar/ekip',
    kind: 'bölüm',
    requiredRole: ['owner'],
  },
  {
    id: 'setting-randevu-hatirlatmalari',
    label: 'Randevu hatırlatmaları',
    description: 'SMS metnini düzenleyin, gönderim akışını kontrol edin',
    keywords: 'sms mesaj hatırlatma bildirim randevu uyarı',
    icon: MessageSquareText,
    href: '/ayarlar/hatirlatmalar',
    kind: 'bölüm',
    requiredRole: ['owner'],
  },
  {
    id: 'setting-plan-paylasimi',
    label: 'Plan paylaşımı',
    description: 'WhatsApp üzerinden gönderilen plan mesajını kişiselleştirin',
    keywords: 'whatsapp mesaj şablon paylaş plan gönder',
    icon: Share2,
    href: '/ayarlar/paylasim',
    kind: 'bölüm',
    requiredRole: ['owner'],
  },
  {
    id: 'setting-veri-guvenligi',
    label: 'Veri güvenliği ve KVKK',
    description: 'Erişim kayıtları ve veri saklama politikası',
    keywords: 'kvkk gizlilik güvenlik denetim log saklama erişim kaydı',
    icon: ShieldCheck,
    href: '/ayarlar/veri-guvenligi',
    kind: 'bölüm',
    requiredRole: ['owner'],
  },
  {
    id: 'setting-masaustu-uygulamasi',
    label: 'Masaüstü uygulaması',
    description: 'Cihaz PIN’i ve otomatik başlangıç ayarları',
    keywords: 'masaüstü desktop pin otomatik başlangıç çevrimdışı offline uygulama',
    icon: MonitorSmartphone,
    href: '/ayarlar',
    kind: 'bölüm',
  },
]

/** Rolü göz önüne alıp aramada gösterilecek ayar girdilerini süzer. */
export function visibleSettingsEntries(role: ClinicMemberRole): SettingsSearchEntry[] {
  return SETTINGS_SEARCH_ENTRIES.filter(
    (entry) => !entry.requiredRole || entry.requiredRole.includes(role),
  )
}
