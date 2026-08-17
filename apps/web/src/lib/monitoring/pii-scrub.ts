// GitHub issue #45 / Prompt 8.1, GÖREV 1 — "Sağlık verisi loglara SIZMASIN
// — PII filtreleme kuralları yaz". Bu dosya Sentry (hata takibi) VE pino
// (yapılandırılmış loglama) için ORTAK, saf ve test edilebilir bir kırpma
// (scrubbing) katmanıdır — ikisi de aynı riski taşıdığı için (bir hata
// nesnesi/log satırı, danışan sağlık verisini taşıyan bir değişkeni içerebilir)
// TEK bir kural kümesi burada, İKİ entegrasyon noktası (sentry.ts, logger.ts)
// bunu ÇAĞIRIR — kural iki yerde ayrı ayrı bakımı gerektirmesin diye.
//
// Alan listesi UYDURULMADI — packages/db/src/schema/clients.ts (clients,
// clientHealth), measurements.ts (measurements, clientGoals) ve
// health-records.ts (labResults, documents) şemalarındaki GERÇEK kolon
// adlarından türetildi (bkz. bu dosyaların başındaki yorumlar — sağlık
// verisi KVKK'da özel nitelikli kişisel veri sayılıyor, "muhtemelen
// hassastır" değil "kesin hassastır" diye ele alınıyor).
//
// Kural KASITLI OLARAK "allow-list neyi göster" değil "deny-list neyi
// kırp" şeklinde TERSİNE çalışmıyor — event/log nesnesi Sentry SDK'sının
// veya pino'nun ürettiği, bizim tam kontrolümüzde olmayan bir şekil
// (request headers, breadcrumbs, stack frame local variables vb.) taşıyabilir.
// Bu yüzden scrubValue() OLASI HER alanı (recursive) gezip SADECE bilinen
// hassas anahtarları/İÇERİK KALIPLARINI (e-posta, telefon, TC kimlik no)
// kırpıyor — geri kalan (event id, seviye, mesaj şablonu, stack trace dosya
// yolu vb.) DOKUNULMADAN geçiyor, aksi halde hata ayıklamak imkânsız hale
// gelirdi.

// --- Anahtar tabanlı kırpma (alan adına göre) -------------------------------

// Danışan kimlik/iletişim (clients.ts), sağlık geçmişi (clientHealth),
// ölçüm (measurements.ts), laboratuvar/dosya (health-records.ts) kolonları —
// hepsi küçük harfe çevrilip aynen karşılaştırılıyor (obje anahtarları
// camelCase VEYA snake_case gelebilir, ör. Sentry request.data JSON.parse
// edilmiş camelCase gelir ama bazı üçüncü parti breadcrumb'lar snake_case
// kullanabilir — bu yüzden karşılaştırmadan önce alt çizgiler de silinir,
// bkz. normalizeKey).
const SENSITIVE_FIELD_NAMES: ReadonlySet<string> = new Set(
  [
    // clients.ts — clients
    'firstname',
    'lastname',
    'birthdate',
    'phone',
    'email',
    'occupation',
    'notes',
    'referralsource',
    // clients.ts — clientHealth (anamnez)
    'conditions',
    'medications',
    'allergies',
    'intolerances',
    'surgeries',
    'familyhistory',
    'smokingstatus',
    'alcoholuse',
    'mealsperday',
    'eatingoutfrequency',
    'waterintakeml',
    'activitynotes',
    'activitylevel',
    'sleephours',
    'sleepquality',
    'bowelhabits',
    // measurements.ts — measurements
    'weightkg',
    'heightcm',
    'waistcm',
    'hipcm',
    'neckcm',
    'armcm',
    'thighcm',
    'chestcm',
    'bodyfatpct',
    'bodyfatkg',
    'leanmasskg',
    'musclemasskg',
    'totalbodywaterl',
    'visceralfatlevel',
    'bmrkcal',
    'phaseangle',
    // measurements.ts — clientGoals
    'targetvalue',
    'startvalue',
    // health-records.ts — labResults
    'analyte',
    'labname',
    'refmin',
    'refmax',
    // health-records.ts — documents
    'filename',
    'storagekey',
    // Kimlik doğrulama / gizli bilgiler (sağlık verisi değil ama AYNI kural
    // motoruyla kırpılması gereken, sızması en az sağlık verisi kadar
    // yıkıcı alanlar)
    'password',
    'authorization',
    'cookie',
    'token',
    'secret',
    'apikey',
    'sessiontoken',
    'ssn',
    'tckimlikno',
    'creditcard',
    'cardnumber',
    'cvv',
    'iban',
  ].map((name) => name.toLowerCase()),
)

// Tam eşleşmeyen ama İÇİNDE geçen anahtarlar için desen — ör. "userEmail",
// "client_phone_number", "x-auth-token" gibi bileşik/kebab-case anahtarları
// yakalar (SENSITIVE_FIELD_NAMES tam eşleşme istiyor, bu ek bir güvenlik ağı).
const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|apikey|api[-_]key|ssn|tckimlik|creditcard|cardnumber|\bcvv\b|\biban\b|email|phone|notes?\b)/i

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '')
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return SENSITIVE_FIELD_NAMES.has(normalized) || SENSITIVE_KEY_PATTERN.test(key)
}

// --- İçerik tabanlı kırpma (serbest metin içindeki kalıplar) ----------------
//
// Bir hata mesajı/breadcrumb, hassas bir alanın adı olmadan da (ör.
// `` `${client.firstName} ${client.lastName} için hesaplama hatası` `` gibi
// enterpolasyonla) sağlık/PII verisi taşıyabilir. Anahtar tabanlı kırpma bunu
// YAKALAYAMAZ — bu yüzden serbest metin alanlarında (message, exception
// value, breadcrumb message) ayrıca kalıp taraması yapılır.

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
// Türkiye cep/sabit telefon kalıpları: +90 5xx xxx xx xx, 0532 123 45 67,
// 05321234567 vb. — ayraç/boşluk/tire toleranslı.
const PHONE_PATTERN = /(?:\+?90[\s.-]?)?0?\s?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g
// TC Kimlik No: 11 haneli, ilk hane 0 olamaz.
const TC_KIMLIK_PATTERN = /\b[1-9]\d{10}\b/g

export function scrubPiiFromText(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]')
    .replace(TC_KIMLIK_PATTERN, '[REDACTED_ID]')
}

export const REDACTED_VALUE = '[REDACTED]'
// Derin gezinme sonsuz döngüye (dairesel referans) veya aşırı derin
// nesnelere karşı bir üst sınır — Sentry event'leri/pino log nesneleri
// pratikte birkaç seviyeden fazla derinleşmez, 8 cömert bir tavan.
const MAX_DEPTH = 8

// Herhangi bir değeri (obje, dizi, ilkel) kırpar. `keyHint`, bu değerin
// ebeveyn objedeki anahtarı — ilkel bir string/number/boolean için ANAHTAR
// hassasse tüm değer [REDACTED] olur; obje/dizi için içine inilir.
export function scrubValue(value: unknown, keyHint: string | undefined, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[REDACTED_MAX_DEPTH]'

  // null/undefined ÖNCE kontrol edilir: boş bir alanın "hassas" olarak
  // [REDACTED] gösterilmesi yanıltıcıdır (sanki gerçek bir değer varmış da
  // gizlenmiş gibi okunur) — taşınacak bir veri yoksa kırpmanın da bir
  // anlamı yok, olduğu gibi geçer.
  if (value === null || value === undefined) return value

  if (keyHint !== undefined && isSensitiveKey(keyHint)) {
    // Hassas anahtarın değeri ne olursa olsun (string, number, obje, dizi)
    // TAMAMEN kırpılır — ör. `allergies: ['fıstık']` içindeki dizi elemanları
    // tek tek değerlendirilmez, KVKK m.6/2 kapsamındaki bu alan hiç
    // Sentry/loglara gitmemeli.
    return REDACTED_VALUE
  }

  if (typeof value === 'string') {
    return scrubPiiFromText(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, undefined, depth + 1))
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = scrubValue(nested, key, depth + 1)
    }
    return result
  }

  // function, symbol, bigint vb. — Sentry event'lerinde/log nesnelerinde
  // pratikte oluşmaz, güvenli tarafta kalıp olduğu gibi bırakılır.
  return value
}

// Bir kayıt (obje) için üst seviye scrub — scrubValue'yu keyHint'siz
// (kökte hassas bir "anahtarı" olmadığı için) çağırır ama HER alt alanı
// kendi anahtarına göre değerlendirir.
export function scrubRecord<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  return scrubValue(record, undefined) as Record<string, unknown>
}
