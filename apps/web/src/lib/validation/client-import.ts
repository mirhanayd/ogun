// GitHub issue #47 / Prompt 8.3, GÖREV 3 — "CSV içe aktarma: danışan listesi
// (ad, telefon, doğum tarihi, kilo geçmişi). Sütun eşleme arayüzü, önizleme,
// hatalı satır raporu." Roadmap'in kendi cümlesi bu aracı bir "satış kapatan
// özellik" olarak tanımlıyor ("rakip sistemden gelen diyetisyenin 400
// danışanını elle girmesi imkânsız") — bu yüzden bu dosya sadece mutlu-yol
// (happy-path) bir CSV'yi DEĞİL, GERÇEKÇİ bozuk bir CSV'yi (eksik sütun,
// karışık tarih formatı, boş satır, sıra karışıklığı) hedefliyor.
//
// SAF (framework'ten bağımsız, test edilebilir) fonksiyonlar burada;
// PapaParse ile dosya okuma/parse UI katmanında (client-import-wizard.tsx).

export type ImportTargetField = 'firstName' | 'lastName' | 'phone' | 'birthDate' | 'weightHistory' | 'ignore'

export const IMPORT_TARGET_FIELD_LABELS_TR: Record<ImportTargetField, string> = {
  firstName: 'Ad',
  lastName: 'Soyad',
  phone: 'Telefon',
  birthDate: 'Doğum tarihi',
  weightHistory: 'Kilo geçmişi',
  ignore: 'Kullanma',
}

// Sütun eşleme arayüzünün ÖN-DOLDURMA sözlüğü — diyetisyenin rakip
// sistemden gelen CSV'sinde sütun adları hiçbir standart takip etmez (ör.
// "Ad Soyad" tek sütunda BİRLEŞİK olabilir — bu durumda kullanıcı elle
// "Kullanma" seçip firstName/lastName'i AYRI girmesi gerekebilir, otomatik
// bölme YAPILMIYOR, riskli bir tahmin bilerek eklenmedi). Anahtarlar
// normalize edilmiş (küçük harf, boşluksuz/alt çizgisiz) CSV başlıklarıdır.
const HEADER_GUESS_MAP: Record<string, ImportTargetField> = {
  ad: 'firstName',
  isim: 'firstName',
  firstname: 'firstName',
  name: 'firstName',
  soyad: 'lastName',
  soyisim: 'lastName',
  lastname: 'lastName',
  surname: 'lastName',
  telefon: 'phone',
  tel: 'phone',
  phone: 'phone',
  gsm: 'phone',
  cep: 'phone',
  dogumtarihi: 'birthDate',
  dogtarihi: 'birthDate',
  birthdate: 'birthDate',
  dob: 'birthDate',
  kilogecmisi: 'weightHistory',
  kilo: 'weightHistory',
  weight: 'weightHistory',
  weighthistory: 'weightHistory',
  agirlik: 'weightHistory',
}

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '')
}

// CSV başlıklarına bakarak her sütun için EN İYİ tahmini hedef alanı üretir
// — kullanıcı bunu sütun eşleme arayüzünde İSTEDİĞİ GİBİ değiştirebilir,
// bu sadece bir başlangıç noktası (bkz. GÖREV 3 "sütun eşleme arayüzü").
export function guessColumnMapping(headers: string[]): Record<string, ImportTargetField> {
  const mapping: Record<string, ImportTargetField> = {}
  const usedTargets = new Set<ImportTargetField>()
  for (const header of headers) {
    const normalized = normalizeHeader(header)
    const guess = HEADER_GUESS_MAP[normalized]
    // Aynı hedef alana iki sütun birden otomatik eşlenmesin (ör. hem "Ad"
    // hem "İsim" varsa ikincisi "Kullanma" kalır, kullanıcı elle seçer).
    if (guess && !usedTargets.has(guess)) {
      mapping[header] = guess
      usedTargets.add(guess)
    } else {
      mapping[header] = 'ignore'
    }
  }
  return mapping
}

export interface ParsedWeightEntry {
  measuredAt: Date
  weightKg: number
}

export interface WeightHistoryParseResult {
  entries: ParsedWeightEntry[]
  invalidSegments: string[]
}

// "Kilo geçmişi" hücresi birden fazla ölçüm taşıyabilir — desteklenen
// biçimler:
//   "72.5"                          → tek değer, tarih = bugün
//   "72,5"                          → Türkçe ondalık virgül de kabul edilir
//   "2024-01-15:72.5"                → tarihli tek değer
//   "2024-01-15:72.5;2024-03-01:70" → ';' VEYA '|' ile ayrılmış çoklu değer
// Ayrıştırılamayan parçalar SESSİZCE atılmaz — invalidSegments'e eklenir,
// böylece hatalı satır raporu HANGİ parçanın okunamadığını gösterebilir.
export function parseWeightHistoryCell(raw: string): WeightHistoryParseResult {
  const entries: ParsedWeightEntry[] = []
  const invalidSegments: string[] = []
  const segments = raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const segment of segments) {
    const parts = segment.split(':')
    let dateStr: string | null = null
    let weightStr: string
    if (parts.length === 2) {
      ;[dateStr, weightStr] = parts as [string, string]
    } else if (parts.length === 1) {
      weightStr = parts[0]!
    } else {
      invalidSegments.push(segment)
      continue
    }

    const normalizedWeight = weightStr.trim().replace(',', '.')
    const weightKg = Number(normalizedWeight)
    if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 400) {
      invalidSegments.push(segment)
      continue
    }

    let measuredAt = new Date()
    if (dateStr) {
      const trimmedDate = dateStr.trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        invalidSegments.push(segment)
        continue
      }
      const parsedDate = new Date(`${trimmedDate}T00:00:00Z`)
      if (Number.isNaN(parsedDate.getTime())) {
        invalidSegments.push(segment)
        continue
      }
      measuredAt = parsedDate
    }

    entries.push({ measuredAt, weightKg })
  }

  return { entries, invalidSegments }
}

// Tarayıcının farklı yerel biçimlerini (GG.AA.YYYY, GG/AA/YYYY, YYYY-MM-DD)
// tolere eder — rakip sistemlerden gelen bir CSV'nin doğum tarihi sütunu
// nadiren ISO biçiminde gelir.
export function parseBirthDateCell(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch
    const iso = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
    return Number.isNaN(new Date(iso).getTime()) ? null : iso
  }
  return null
}

export interface ImportRowValidationOk {
  ok: true
  rowNumber: number
  firstName: string
  lastName: string
  phone: string | null
  birthDate: string | null
  weightHistory: ParsedWeightEntry[]
  warnings: string[]
}

export interface ImportRowValidationError {
  ok: false
  rowNumber: number
  reason: string
}

export type ImportRowValidationResult = ImportRowValidationOk | ImportRowValidationError

// Ham bir CSV satırını (hücre değerlerinin sütun -> hedef alan eşlemesiyle
// zaten birleştirilmiş hali) doğrular. rowNumber 1-bazlı VE başlık satırını
// SAYAR (kullanıcı Excel'de gördüğü satır numarasıyla eşleşsin diye) —
// çağıran taraf (client-import-wizard.tsx) bunu header + index + 1 olarak
// hesaplar.
export function validateImportRow(
  rowNumber: number,
  raw: { firstName?: string; lastName?: string; phone?: string; birthDate?: string; weightHistory?: string },
): ImportRowValidationResult {
  const firstName = (raw.firstName ?? '').trim()
  const lastName = (raw.lastName ?? '').trim()

  if (firstName === '' && lastName === '') {
    return { ok: false, rowNumber, reason: 'Ad ve soyad boş — satır tamamen atlandı.' }
  }
  if (firstName === '') {
    return { ok: false, rowNumber, reason: 'Ad sütunu boş.' }
  }
  if (lastName === '') {
    return { ok: false, rowNumber, reason: 'Soyad sütunu boş.' }
  }
  if (firstName.length > 80 || lastName.length > 80) {
    return { ok: false, rowNumber, reason: 'Ad/soyad 80 karakterden uzun.' }
  }

  const warnings: string[] = []

  const phoneRaw = (raw.phone ?? '').trim()
  const phone = phoneRaw === '' ? null : phoneRaw.slice(0, 30)
  if (phoneRaw.length > 30) warnings.push('Telefon numarası 30 karaktere kırpıldı.')

  let birthDate: string | null = null
  const birthDateRaw = (raw.birthDate ?? '').trim()
  if (birthDateRaw !== '') {
    birthDate = parseBirthDateCell(birthDateRaw)
    if (birthDate === null) {
      warnings.push(`Doğum tarihi okunamadı, boş bırakıldı: "${birthDateRaw}"`)
    } else if (new Date(birthDate).getTime() > Date.now()) {
      birthDate = null
      warnings.push('Doğum tarihi gelecekte olamaz, boş bırakıldı.')
    }
  }

  let weightHistory: ParsedWeightEntry[] = []
  const weightRaw = (raw.weightHistory ?? '').trim()
  if (weightRaw !== '') {
    const parsed = parseWeightHistoryCell(weightRaw)
    weightHistory = parsed.entries
    if (parsed.invalidSegments.length > 0) {
      warnings.push(`Kilo geçmişindeki bazı değerler okunamadı: ${parsed.invalidSegments.join(', ')}`)
    }
  }

  return { ok: true, rowNumber, firstName, lastName, phone, birthDate, weightHistory, warnings }
}
