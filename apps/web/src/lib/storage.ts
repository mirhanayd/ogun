import 'server-only'
import { S3Client, DeleteObjectCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// S3 uyumlu depolama soyutlaması — GitHub issue #19 / Prompt 4.3, GÖREV 3:
// "S3 uyumlu depolama (yerel: MinIO, üretim: Cloudflare R2 veya S3).
// Presigned URL ile yükleme, dosyalar asla public olmasın."
//
// @aws-sdk/client-s3 hem MinIO hem R2 hem gerçek S3 ile AYNI protokolle
// (S3 API) konuşur — bu yüzden tek bir istemci, sadece env değişkenleri
// (endpoint/region/forcePathStyle) değişerek üç ortamda da çalışır. Vercel'e
// özel bir dosya depolama API'si (ör. Vercel Blob) BİLEREK kullanılmadı
// (mimari kural #4 — Vercel'e özel API yok, standart Node + Docker).
//
// docker-compose.yml'e MinIO servisi bu issue'da eklendi (bkz. o dosya).
// ÖNEMLİ — DOĞRULAMA SINIRI: bu sandbox ortamında Docker çalıştırılamadığı
// için gerçek bir MinIO container'a karşı canlı bir yükleme/indirme
// denemesi YAPILAMADI. Şema/kod seviyesinde doğrulama (typecheck, unit
// testler) yapıldı; canlı MinIO doğrulaması PR açıklamasında ayrıca not
// düşüldü — bu, önceki PR'lerdeki "DB şeması üretildi ama canlı bir DB'ye
// UYGULANMADI" ile AYNI doğrulama sınırı deseni.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} ortam değişkeni tanımlı değil — depolama yapılandırması eksik.`)
  }
  return value
}

let cachedClient: S3Client | null = null

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient
  cachedClient = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: requireEnv('S3_ENDPOINT'),
    // MinIO (yerel) için true — bucket adı path'te (http://host/bucket/key),
    // subdomain'de DEĞİL. Gerçek AWS S3/R2'de genelde false/gereksiz.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
    },
  })
  return cachedClient
}

function getBucket(): string {
  return requireEnv('S3_BUCKET')
}

const PRESIGNED_URL_TTL_SECONDS = 5 * 60

// Presigned PUT URL — istemci dosyayı DOĞRUDAN MinIO/S3'e yükler, sunucudan
// geçmez (büyük BİA çıktısı fotoğrafları/PDF'ler için gereksiz bir sunucu
// bant genişliği/bellek yükü olmasın diye). Sunucu sadece anahtarı üretir
// ve imzalar — dosyanın KENDİSİNİ HİÇ görmez.
export async function createPresignedUploadUrl(
  storageKey: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string }> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: storageKey,
    ContentType: contentType,
  })
  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: PRESIGNED_URL_TTL_SECONDS })
  return { uploadUrl, storageKey }
}

// Presigned GET URL — "dosyalar asla public olmasın" kuralı: bucket'ın
// kendisi private, her görüntüleme/önizleme kısa ömürlü, tek seferlik bir
// imzalı URL üzerinden olur.
export async function createPresignedDownloadUrl(storageKey: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: storageKey })
  return getSignedUrl(getS3Client(), command, { expiresIn: PRESIGNED_URL_TTL_SECONDS })
}

export async function deleteStorageObject(storageKey: string): Promise<void> {
  await getS3Client().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: storageKey }))
}

// Bir danışanın belgeleri için isim çakışmasını önleyen, tahmin edilemez
// bir depolama anahtarı üretir. clientId önekte tutulur — ileride "bu
// danışanın TÜM dosyalarını sil" gibi toplu bir işlem gerekirse (KVKK veri
// sahibi hakları, bkz. lib/data-subject-rights.ts) prefix listeleme ile
// bulunabilsinler diye.
export function buildDocumentStorageKey(clientId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const unique = crypto.randomUUID()
  return `clients/${clientId}/documents/${unique}-${safeName}`
}
