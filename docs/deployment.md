# Dağıtım — GitHub issue #46 / Prompt 8.2

Bu belge iki dağıtım yolunu da anlatır: **Vercel + Neon** (önerilen, en az
operasyonel yük) ve **self-hosted Docker + VPS** (Türkiye/KKTC'de veri
egemenliği veya maliyet gerekçesiyle tercih edilebilecek yol). Mimari kural
#6 gereği ikisi de AYNI kod tabanından, Vercel'e özel HİÇBİR API olmadan
çalışır — `docs/performance.md`'nin izlediği dürüstlük ilkesiyle: bu belgede
**gerçekten çalıştırılan** komutlar ile **dokümante edilen ama bu sandbox'ta
gerçek bir Neon/Vercel hesabı olmadığı için canlı doğrulanamayan** adımlar
açıkça ayrı işaretlenmiştir.

## 0. Ortam değişkenleri

Tek doğrulama noktası: `apps/web/src/env.ts` (Zod şeması). `.env.example`,
uygulamanın okuduğu HER değişkeni açıklar — yeni bir değişken eklerken ikisi
de güncellenmeli (bkz. env.ts dosya başı notu).

`APP_ENV` (local | staging | production) hangi kuralların uygulanacağını
belirler; boşsa `NODE_ENV`'den türetilir.

| Değişken grubu | local | staging / production |
|---|---|---|
| `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL` | Zorunlu | Zorunlu |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Zorunlu | Zorunlu |
| `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | Opsiyonel (ikisi birlikte ya da hiçbiri) | Opsiyonel (aynı kural) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Opsiyonel — boşsa plan e-posta paylaşımı çalışmaz | **Zorunlu** |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Opsiyonel | Opsiyonel — GÜÇLÜ ÖNERİ (bkz. aşağıdaki not) |
| `LOG_LEVEL`, `SENTRY_ENVIRONMENT`, `SENTRY_ORG/PROJECT/AUTH_TOKEN`, `DATABASE_POOL_MAX` | Opsiyonel | Opsiyonel |

Eksik bir zorunlu değişkenle sunucu **başlamaz** — `instrumentation.ts`'in
`register()`'ı `assertValidEnv()`'i sunucu her açıldığında (next dev / next
start, next build sırasında DEĞİL) çağırır ve hangi değişkenin eksik/hatalı
olduğunu satır satır yazan bir Error ile süreci durdurur. Bu, aşağıdaki
Docker doğrulamasında GERÇEKTEN tetiklendi (bkz. "Self-hosted" bölümü, adım
5 — RESEND_* olmadan container'ın gerçekten başlamayı reddettiği loglandı).

**NOT — Sentry neden production'da da opsiyonel**: #45'te alınan ürün
kararı, DSN yokken Sentry'nin sessizce no-op olmasıydı. Bu davranış
korunuyor; env.ts bunu ZORUNLU hale getirmiyor (geriye dönük tutarlılık).
Ama gerçek bir production dağıtımında Sentry'siz çalışmak önerilmez —
sağlık verisi taşıyan bir uygulamada hata izleme olmadan üretime çıkmak
operasyonel bir risktir.

## 1. Yol A — Vercel + Neon (önerilen)

### 1.1 Neon (Frankfurt) kurulumu — DOKÜMANTE EDİLDİ, canlı hesap YOK

1. [neon.tech](https://neon.tech) üzerinde proje oluştur, **Region: EU
   (Frankfurt, eu-central-1)** seç — KVKK/sağlık verisi için AB içi veri
   ikameti (#45'in Sentry EU kararıyla AYNI gerekçe).
2. Neon konsolunda varsayılan olarak İKİ bağlantı dizesi sunulur:
   - **Pooled connection** (host adında `-pooler` son eki) — PgBouncer
     üzerinden, çok sayıda kısa ömürlü bağlantı için (serverless
     function'lar, Vercel Edge/Node fonksiyonları).
   - **Direct connection** — migration çalıştırmak için (bazı DDL
     komutları PgBouncer transaction modunda güvenilir çalışmaz).
   Kural: `DATABASE_URL` (uygulamanın çalışma zamanı) → **pooled** uç
   nokta. Migration adımı (aşağıda) → **direct** uç nokta ayrı bir
   `DATABASE_URL` ile (CI/CD secret'ı olarak `MIGRATE_DATABASE_URL` gibi
   ayrı bir isimle saklanması önerilir).
3. Neon panelinden kopyalanan dizede `?sslmode=require` zaten vardır;
   `packages/db/src/client.ts` ayrıca `ssl: 'prefer'` ile TLS'i garanti
   eder (yerel Postgres'i bozmadan) — bkz. o dosyanın notu.
4. Gerekli Postgres eklentileri (`pg_trgm`, `unaccent` — besin arama
   için, bkz. `docker/initdb/01-extensions.sql`) Neon'da elle
   etkinleştirilmeli (Neon initdb script'lerini ÇALIŞTIRMAZ):
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE EXTENSION IF NOT EXISTS unaccent;
   ```
   Bu SQL'i Neon konsolunun "SQL Editor"ünden BİR KEZ, ilk migration'dan
   ÖNCE çalıştır (bu sandbox'ta AYNI adım gerçek bir Postgres'e karşı
   test edildi, bkz. aşağıdaki "Migration-on-deploy" bölümü — extension
   olmadan migration'ın gerçekten `gin_trgm_ops` hatasıyla BAŞARISIZ
   OLDUĞU görüldü, extension eklenince sorunsuz geçti).
5. Neon'un kendi **Point-in-Time Restore** (PITR) özelliği plana göre
   1-30 gün geriye dönük saklama sağlar — `scripts/backup-db.sh`
   (bkz. `docs/runbook.md`) bunun YERİNE geçmez, PITR penceresi dışına
   taşan uzun vadeli arşiv kopyaları için TAMAMLAYICIDIR.
6. `DATABASE_POOL_MAX` — Neon pooler'ı arkasında birden fazla Vercel
   fonksiyon instance'ı çalışabileceğinden, instance başına düşük bir
   değer (ör. `5`) PgBouncer'ın kendi limitini aşmamak için önerilir.

### 1.2 Vercel yapılandırması

`apps/web/vercel.json` bu repoda tanımlı:

```json
{
  "buildCommand": "cd ../.. && pnpm turbo run build --filter=web...",
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "framework": "nextjs",
  "regions": ["fra1"]
}
```

- **Root Directory**: Vercel proje ayarlarında `apps/web` olarak
  ayarlanmalı (monorepo — Vercel'in "Root Directory" alanı).
- **Region**: `fra1` (Frankfurt) — Neon (Frankfurt) ile aynı bölge,
  veritabanı gecikmesini minimumda tutar.
- `output: 'standalone'` (next.config.ts) Vercel'de YOK SAYILIR — Vercel
  kendi build çıktı formatını kullanır; bu ayar SADECE Docker yolu için
  anlamlıdır. Yani next.config.ts iki yol için de DEĞİŞMEDEN kullanılır
  (mimari kural #6'nın somut kanıtı).
- Ortam değişkenleri: Vercel proje ayarlarının "Environment Variables"
  bölümünden, Production/Preview/Development ortamları için AYRI
  değerlerle girilir — `.env.example`'daki HER satır buraya taşınmalı.
  `NEXT_PUBLIC_*` değişkenlerinin Production ortamında gerçek domain'i
  göstermesi ÖZELLİKLE önemlidir (build zamanında gömülürler, bkz.
  aşağıdaki Dockerfile notunun AYNISI).

### 1.3 Turborepo Remote Cache

```bash
npx turbo login
npx turbo link
```

Vercel'e bağlı bir repo için Vercel, Turborepo Remote Cache'i OTOMATİK
sağlar (Vercel hesabına bağlı projelerde ek yapılandırma gerekmez — build
sırasında `Remote caching enabled` mesajı görülür). Self-hosted CI
(ör. GitHub Actions, VPS üzerinde) kullanan bir kurulum için:

```bash
# GitHub Actions secret'ları: TURBO_TOKEN, TURBO_TEAM
turbo run build --filter=web... --token=$TURBO_TOKEN --team=$TURBO_TEAM
```

Bu sandbox'ta gerçek bir Vercel/Turbo hesabı OLMADIĞI için remote cache
canlı test edilemedi — yerel doğrulamada `turbo`'nun "Remote caching
disabled, using shared worktree cache" mesajıyla yerel dosya sistemi
cache'ine düştüğü gözlendi (bkz. bu PR'ın `pnpm typecheck`/`pnpm build`
çıktıları), bu beklenen ve zararsız bir davranıştır.

### 1.4 Migration-on-deploy (Vercel yolu)

Vercel'in build adımı migration ÇALIŞTIRMAMALI (build birden fazla kez/
paralel tetiklenebilir, migration'ın TEK seferlik ve build'den BAĞIMSIZ
olması gerekir). Önerilen akış: bir GitHub Actions job'ı, `main`'e merge
sonrası Vercel deploy'undan ÖNCE (ya da hemen sonra, downtime toleransına
göre) şunu çalıştırır:

```bash
DATABASE_URL="$MIGRATE_DATABASE_URL" pnpm --filter @ogun/db db:migrate
```

Bu komut, aşağıdaki "Self-hosted" bölümünde ANLATILAN VE GERÇEKTEN
ÇALIŞTIRILAN `drizzle-kit migrate` ile TAMAMEN AYNIDIR — tek fark
DATABASE_URL'in Neon'un direct (pooled OLMAYAN) uç noktasını göstermesi.

## 2. Yol B — Self-hosted: Docker + VPS

Bu, "Türkiye'de VPS'e taşınma bir haftalık iş olmalı" ifadesinin somut
karşılığı — hiçbir Vercel/Neon hesabı olmadan, tek bir VPS'te (ör.
Hetzner, DigitalOcean, bir Türk barındırma sağlayıcısı) TAM bir dağıtım.

### 2.1 Bileşenler

- `apps/web/Dockerfile` — 4 aşamalı (base/pruner/installer/runner) +
  ayrı bir `migrator` hedefi, `turbo prune web --docker` ile SADECE
  web'in bağımlı olduğu workspace paketlerini (packages/db,
  nutrition-core, pdf) içeren minimal bir imaj üretir.
- `docker-compose.prod.yml` — web + postgres + minio, `docker-compose.yml`
  (yerel geliştirme) ile AYNI servis şekli, üretime uygun sertleştirmelerle
  (portlar dışa kapalı, healthcheck'ler, zorunlu şifreler).
- `.dockerignore` — build context'ten node_modules/.next/.git vb. dışlar.

### 2.2 GERÇEKTEN ÇALIŞTIRILAN doğrulama (bu PR'da, Docker bu sandbox'ta
mevcuttu)

Aşağıdaki komutlar bu PR'ın hazırlanması sırasında GERÇEKTEN çalıştırıldı,
uydurma değildir:

```bash
# 1) Web imajını (production runner hedefi) derle
docker build -f apps/web/Dockerfile -t ogun-web:test .
# → turbo prune + pnpm install + `pnpm turbo run build --filter=web...`
#   GERÇEKTEN çalıştı, 29 sayfa statik/dinamik olarak üretildi, standalone
#   çıktı (.next/standalone) minimal runner imajına kopyalandı.

# 2) Container'ı EKSİK RESEND_* ile başlat (production ortamı simülasyonu)
docker run --rm -e DATABASE_URL=... -e BETTER_AUTH_SECRET=... ... ogun-web:test
# → GERÇEK ÇIKTI:
#   "Ortam değişkeni doğrulaması başarısız (APP_ENV=production).
#    Uygulama başlatılamıyor:
#      - RESEND_API_KEY: ... production ortamında zorunlu ...
#      - RESEND_FROM_EMAIL: ... production ortamında zorunlu."
#   Süreç çöktü (assertValidEnv'in beklenen davranışı) — "eksik
#   değişkenle uygulama başlamasın" kuralı CANLI doğrulandı.

# 3) TÜM zorunlu değişkenlerle tekrar başlat
docker run -d -p 3100:3000 -e RESEND_API_KEY=re_test_key \
  -e RESEND_FROM_EMAIL="Öğün <bildirim@ogun.co>" ... ogun-web:test
# → "✓ Ready in 154ms", "Better Auth" uyarıları (Google OAuth boş,
#   beklenen) dışında hatasız başladı.

# 4) Gerçek HTTP isteği
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3100/
# → HTTP 200 (gerçek HTML gövdesi döndü, <html lang="tr"> dahil)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/giris
# → 200
```

Migration hedefi de ayrıca GERÇEK bir Postgres'e karşı doğrulandı — bkz.
`docs/runbook.md` "Migration doğrulaması" bölümü (aynı komutlar, dump/
restore testiyle birlikte).

### 2.3 Kurulum adımları (VPS'te, ilk dağıtım)

```bash
# VPS'te (Ubuntu 22.04/24.04 varsayımıyla)
curl -fsSL https://get.docker.com | sh
git clone <repo-url> /opt/ogun && cd /opt/ogun
cp .env.example .env
# .env'i doldur: DATABASE_URL (self-hosted postgres servisine işaret
# etsin: postgresql://postgres:$POSTGRES_PASSWORD@postgres:5432/ogun),
# POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, BETTER_AUTH_SECRET
# (`openssl rand -base64 32`), S3_* (minio servisine işaret etsin),
# RESEND_*, NEXT_PUBLIC_BETTER_AUTH_URL (gerçek domain).

docker compose -f docker-compose.prod.yml build \
  --build-arg NEXT_PUBLIC_BETTER_AUTH_URL=https://app.ornek-klinik.com
# ↑ ÖNEMLİ: NEXT_PUBLIC_* build zamanında GÖMÜLÜR, .env'deki değer
# runtime'da bunu DEĞİŞTİREMEZ — bkz. Dockerfile'daki ilgili not.

docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

### 2.4 Ters proxy ve TLS

`docker-compose.prod.yml` web servisini 3000 portunda dışa açar ama
üretimde bir ters proxy (Caddy önerilir — otomatik Let's Encrypt, tek
satır config) arkasına alınmalı:

```caddyfile
app.ornek-klinik.com {
  reverse_proxy localhost:3000
}
```

### 2.5 Güncelleme (yeni sürüm dağıtımı)

```bash
cd /opt/ogun && git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate   # ÖNCE migration
docker compose -f docker-compose.prod.yml up -d web           # SONRA web'i güncelle
```

## 3. Yedekleme ve kurtarma

Bkz. `docs/runbook.md` — günlük otomatik yedek (cron örneği) ve
GERÇEKTEN test edilmiş, gerçek komutlarla belgelenmiş geri yükleme
prosedürü.

## 4. Bilinen sınırlamalar / bu sandbox'ta doğrulanamayanlar

- **Gerçek Neon hesabı yok** — 1.1'deki adımlar Neon'un yayınlanmış
  davranışına (pooled/direct uç nokta ayrımı, sslmode, PITR) dayanarak
  DOKÜMANTE edildi, canlı bir Neon projesine karşı ÇALIŞTIRILMADI.
- **Gerçek Vercel hesabı yok** — vercel.json ve remote cache adımları
  DOKÜMANTE edildi, canlı deploy tetiklenmedi.
- **`next build --turbopack` yerelde (Windows, iç içe git worktree)** —
  önceki PR'lerde de görülen `@better-auth/core` çözümleme hatasıyla
  BAŞARISIZ olur (worktree'nin repo kökünün İÇİNDE olması, Turbopack'in
  yanlış workspace root'u seçmesine yol açıyor — `.claude/worktrees/...`
  altında GERÇEK bir sorun DEĞİL). `next build` (webpack, `--turbopack`
  OLMADAN) AYNI ortamda 29 sayfayı sorunsuz üretti, sadece Windows'a özgü
  bir dosya izni (`EPERM: symlink`) standalone trace kopyalamasında
  görüldü — Linux tabanlı Docker imajında (asıl dağıtım hedefi) bu sorun
  YOK, bkz. 2.2'deki gerçek Docker doğrulaması.
