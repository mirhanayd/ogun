import { z } from 'zod'
// TİP-ONLY içe aktarım: nav-items.ts'teki ClinicMemberRole ile aynı desen —
// buradan (@ogun/db/schema) sadece TİP alınır, çalışma zamanı değeri
// (drizzle-orm pgEnum nesnesi) ALINMAZ. Bu dosya 'use client' form
// bileşenlerinden de içe aktarılıyor (bkz. yeni/new-client-form.tsx,
// [id]/general-tab-form.tsx) — drizzle-orm'u istemci paketine sürüklememek
// için zod şemalarındaki değer listeleri (SEX_OPTIONS, STATUS_OPTIONS)
// BİLEREK burada ayrıca sabit olarak tanımlanıyor (aşağıda), şemadan
// türetilmiyor.
import type { ClientSex, ClientStatus } from '@ogun/db/schema'

// KVKK rıza kuralı (GitHub issue #12 / Prompt 3.3 — GÖREV 3): bir danışan
// kaydı, rıza alınmadan "tamamlanmış"/aktif sayılamaz. Bu şema o zaman
// (danışan kaydının TAMAMI henüz kurulmamışken) sadece bir Zod şeması + bir
// invaryant fonksiyonu (assertClientConsentComplete) olarak eklenmişti;
// gerçek UI akışı (yeni danışan formu) artık GitHub issue #17 / Prompt 4.1
// ile var — bkz. app/(app)/danisanlar/yeni/new-client-form.tsx ve
// app/(app)/danisanlar/actions.ts createClientAction.
//
// kvkkConsentAt/kvkkConsentVersion VE explicitConsentAt BİLEREK ayrı zorunlu
// alanlar: KVKK m.5/6 genel işleme şartları ile m.6/2 özel nitelikli veri
// (sağlık verisi) için açık rıza şartı FARKLI hukuki dayanaklardır, aynı onay
// kutusuyla birleştirilemez (bkz. schema/clients.ts üstündeki not).
// marketingConsentAt ise ayrı VE opsiyonel — kaydın tamamlanması için gerekmez.
export const clientConsentSchema = z.object({
  kvkkConsentAt: z.date({ required_error: 'KVKK aydınlatma metni onayı zorunludur.' }),
  kvkkConsentVersion: z
    .string()
    .trim()
    .min(1, 'Onaylanan aydınlatma metninin sürümü belirtilmelidir.'),
  explicitConsentAt: z.date({
    required_error: 'Özel nitelikli kişisel veri (sağlık verisi) için açık rıza zorunludur.',
  }),
  marketingConsentAt: z.date().optional().nullable(),
})
export type ClientConsentInput = z.infer<typeof clientConsentSchema>

// Yeni oluşturulan (henüz rıza alanları NULL olabilen) bir danışan satırının
// rıza durumunu bu kurala karşı kontrol eder. Alt seviyedeki createClient
// sorgusu (packages/db/src/queries/clients.ts) rızayı KENDİSİ zorunlu
// kılmaz — "15 saniyeden kısa hızlı kayıt" hedefiyle çelişmesin diye bu
// invaryant BİLEREK tek bir yerde, çağıran server action'da (actions.ts
// createClientAction) uygulanır; newClientSchema'daki checkbox .refine()'ları
// zaten aynı kuralı istemci tarafında da tekrarlar (bkz. aşağısı).
const requiredConsentShape = clientConsentSchema.pick({ kvkkConsentAt: true, explicitConsentAt: true })

export interface ClientConsentState {
  kvkkConsentAt: Date | null
  explicitConsentAt: Date | null
}

export function isClientConsentComplete(consent: ClientConsentState): boolean {
  return requiredConsentShape.safeParse(consent).success
}

export class ClientConsentIncompleteError extends Error {
  constructor(message = 'Danışan kaydı, KVKK ve açık rıza alınmadan tamamlanamaz.') {
    super(message)
    this.name = 'ClientConsentIncompleteError'
  }
}

// Danışan oluşturma server action'ının (bkz. app/(app)/danisanlar/actions.ts
// createClientAction, GitHub issue #17 / Prompt 4.1) çağırdığı invaryant
// kontrolü — kural sağlanmıyorsa fırlatır. Dönüş tipi BİLEREK `asserts consent
// is {...}`: bu, sadece bir çalışma zamanı kontrolü değil, TypeScript'e de
// "buradan sonra kvkkConsentAt/explicitConsentAt artık null değil" bilgisini
// verir — çağıran taraf (createClientAction) bu sayede consent.kvkkConsentAt!
// gibi bir non-null assertion'a başvurmadan Date olarak kullanabilir.
export function assertClientConsentComplete(
  consent: ClientConsentState,
): asserts consent is { kvkkConsentAt: Date; explicitConsentAt: Date } {
  if (!isClientConsentComplete(consent)) {
    throw new ClientConsentIncompleteError()
  }
}

// ---------------------------------------------------------------------------
// Danışan kaydı (GitHub issue #17 / Prompt 4.1)
// ---------------------------------------------------------------------------

// Aydınlatma metninin şu an geçerli sürümü — GERÇEK hukuki metin burada YOK
// (bkz. dosyanın en üstündeki not ve schema/clients.ts kvkkConsentVersion
// açıklaması), bu sadece "hangi sürüme onay verildi"ni etiketlemek için bir
// yer tutucu sürüm kodu. Ürün sahibi/hukuk ekibi aydınlatma metnini
// yayınladığında bu sabit güncellenmeli.
export const CURRENT_KVKK_CONSENT_VERSION = '2026-01'

// Radix <Select> boş string value KABUL ETMEZ (iç uyarı fırlatır) — bu yüzden
// "cinsiyet belirtilmedi" durumu için ayrı bir sentinel değer kullanılıyor.
// Form katmanı bunu z.infer tipiyle taşır, server action'lar (actions.ts)
// gönderim anında bunu `null`'a çevirir (bkz. schema/clients.ts sex alanı
// nullable).
export const SEX_NOT_SPECIFIED = 'unspecified' as const

// Değerler BİLEREK zod şemasından TÜRETİLMİYOR (bkz. dosya başındaki tip-only
// içe aktarım notu) — burada elle, İngilizce DB değerleriyle bire bir
// eşleşecek şekilde tutuluyor.
export const SEX_OPTIONS: { value: ClientSex; label: string }[] = [
  { value: 'female', label: 'Kadın' },
  { value: 'male', label: 'Erkek' },
]
export const SEX_LABELS_TR: Record<ClientSex, string> = {
  female: 'Kadın',
  male: 'Erkek',
}

export const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: 'aktif', label: 'Aktif' },
  { value: 'pasif', label: 'Pasif' },
  { value: 'arşiv', label: 'Arşiv' },
]
export const STATUS_LABELS_TR: Record<ClientStatus, string> = {
  aktif: 'Aktif',
  pasif: 'Pasif',
  arşiv: 'Arşiv',
}

const sexFieldSchema = z.enum(['male', 'female', SEX_NOT_SPECIFIED])

// GG.AA.YYYY değil YYYY-MM-DD — <input type="date"> tarayıcı formatı ile
// birebir, ekstra bir ayrıştırma/biçim dönüşümüne gerek bırakmıyor.
const birthDateFieldSchema = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Doğum tarihi geçersiz.')
  .refine((value) => value === '' || new Date(value).getTime() <= Date.now(), 'Doğum tarihi gelecekte olamaz.')
  .optional()
  .or(z.literal(''))

// Yeni danışan formu (GÖREV 3 — "tek sayfalık, hızlı"). SADECE firstName +
// lastName + rıza onayları DB seviyesinde de zorunlu (bkz. schema/clients.ts
// notNull alanları); phone/birthDate/sex burada VAR ama forma "gerçekten
// hızlı" hissettirmek için opsiyonel — diyetisyen isterse sadece ad+soyad
// girip rıza kutularını işaretleyip 15 saniyeden kısa sürede kaydedebilir,
// isterse aynı ekranda telefon/doğum tarihi/cinsiyeti de doldurabilir
// (roadmap'in GÖREV 3'te bu beşini birlikte listelemesinin nedeni budur —
// "gerisi sonra doldurulur" diğer alanlar (meslek, notlar, vb.) için geçerli).
export const newClientSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Ad en az 2 karakter olmalıdır.').max(80, 'Ad en fazla 80 karakter olabilir.'),
    lastName: z.string().trim().min(2, 'Soyad en az 2 karakter olmalıdır.').max(80, 'Soyad en fazla 80 karakter olabilir.'),
    phone: z.string().trim().max(30, 'Telefon numarası çok uzun.').optional().or(z.literal('')),
    birthDate: birthDateFieldSchema,
    // BİLEREK .default(...) KULLANILMADI: zod'un ZodDefault sarmalayıcısı,
    // objectOutputType hesaplamasında bu alanı hâlâ "opsiyonel" (?:) olarak
    // işaretliyor — bu da react-hook-form'un zodResolver<T> ile üretilen
    // Resolver tipiyle burada elle yazılan FormValues tipinin (aşağıdaki
    // z.infer) çakışmasına yol açıyordu (sex zorunlu mu değil mi
    // anlaşmazlığı). "Belirtilmedi" varsayılanı bunun yerine SADECE form
    // katmanında (useForm defaultValues) veriliyor — bkz. yeni/new-client-form.tsx
    // ve [id]/general-tab-form.tsx.
    sex: sexFieldSchema,
    kvkkConsentChecked: z.boolean(),
    explicitConsentChecked: z.boolean(),
  })
  .refine((data) => data.kvkkConsentChecked, {
    message: 'KVKK aydınlatma metni onayı zorunludur.',
    path: ['kvkkConsentChecked'],
  })
  .refine((data) => data.explicitConsentChecked, {
    message: 'Sağlık verisi için açık rıza onayı zorunludur.',
    path: ['explicitConsentChecked'],
  })
export type NewClientFormValues = z.infer<typeof newClientSchema>

// Danışan detay sayfası "Genel" sekmesi (GÖREV 4) — yeni danışan formunun
// aksine burada status DA düzenlenebilir (arşivden geri alma tekil kayıt
// üzerinden de mümkün olsun diye; toplu "arşivle" ayrıca liste sayfasında var).
export const clientGeneralInfoSchema = z.object({
  firstName: z.string().trim().min(2, 'Ad en az 2 karakter olmalıdır.').max(80, 'Ad en fazla 80 karakter olabilir.'),
  lastName: z.string().trim().min(2, 'Soyad en az 2 karakter olmalıdır.').max(80, 'Soyad en fazla 80 karakter olabilir.'),
  birthDate: birthDateFieldSchema,
  // .default(...) kullanılmıyor — bkz. newClientSchema'daki sex alanı
  // üstündeki not (zodResolver<T> tip çakışması).
  sex: sexFieldSchema,
  phone: z.string().trim().max(30, 'Telefon numarası çok uzun.').optional().or(z.literal('')),
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.').optional().or(z.literal('')),
  occupation: z.string().trim().max(120, 'Meslek çok uzun.').optional().or(z.literal('')),
  referralSource: z.string().trim().max(120, 'Bu alan çok uzun.').optional().or(z.literal('')),
  notes: z.string().trim().max(4000, 'Notlar çok uzun.').optional().or(z.literal('')),
  status: z.enum(['aktif', 'pasif', 'arşiv']),
  // GitHub issue #41 / Prompt 7.3, GÖREV 3 — "Danışanın SMS rızası yoksa
  // gönderme". marketingConsentAt gibi checkbox'ı OPSİYONEL (kaydın
  // tamamlanması için gerekmez) — ama BURADA, KVKK onaylarının aksine, DB
  // seviyesinde de asla zorunlu (notNull) değil (bkz. schema/clients.ts
  // smsConsentAt notu).
  smsConsentChecked: z.boolean(),
})
export type ClientGeneralInfoFormValues = z.infer<typeof clientGeneralInfoSchema>
