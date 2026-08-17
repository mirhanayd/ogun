# syntax=docker/dockerfile:1
#
# GitHub issue #46 / Prompt 8.2, GÖREV 3 — "apps/web için Dockerfile
# (standalone Next.js çıktısı), pnpm workspace-aware, minimal final imaj."
# KURAL: Vercel'e özel hiçbir şey kullanılmaz — bu imaj Docker çalıştıran
# HERHANGİ bir VPS'te (bkz. docs/deployment.md "Self-hosted: Docker + VPS")
# aynen çalışır.
#
# `turbo prune web --docker`, apps/web'in GERÇEKTEN bağımlı olduğu workspace
# paketlerini (packages/db, packages/nutrition-core, packages/pdf,
# packages/tsconfig, packages/eslint-config) ve budanmış bir pnpm-lock.yaml'ı
# çıkarır — repo kökündeki apps/etl, apps/e2e gibi bu imajla İLGİSİZ
# paketler final imaja hiç girmez. Bu, "workspace: protokolüyle kırılan ya da
# tüm monorepo'yu kopyalayan naif Dockerfile" tuzağının çözümü.
#
# 4 aşama:
#   base      → ortak Node + pnpm kurulumu
#   pruner    → turbo prune ile sadece web'in bağımlılık alt kümesini çıkarır
#   installer → pruned bağımlılıkları kurar, `next build` (standalone) çalıştırır
#   runner    → SADECE .next/standalone + static + public'i taşıyan minimal imaj
#
# Ayrıca bkz. aşağıdaki `migrator` hedefi (aynı installer aşamasından türer,
# `docker build --target migrator` ile ayrı kullanılır) — dağıtımda
# `drizzle-kit migrate` çalıştırmak için, bkz. docs/deployment.md
# "Migration-on-deploy".

FROM node:20-alpine AS base
# Next.js'in derleme/çalışma zamanı bağımlılıkları için glibc uyumluluk
# katmanı (sharp, better-sqlite3 gibi native modüller alpine'de bunu ister;
# bu projede doğrudan yok ama transitif bağımlılıklarda çıkabilir — ucuz bir
# önlem, imaj boyutuna göz ardı edilebilir etkisi var).
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable

FROM base AS pruner
COPY . .
RUN npx turbo prune web --docker

FROM base AS installer
WORKDIR /app
# Önce SADECE manifest dosyalarını kopyala (out/json) — pnpm install bu
# katmanda cache'lenir, sadece package.json'lar değiştiğinde yeniden çalışır.
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
# Şimdi gerçek kaynak kodunu kopyala ve derle.
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
# next.config.ts'teki output:'standalone'u SADECE Docker build'inde açar
# (Windows'ta yerel `pnpm build`'i symlink EPERM hatasından korumak için).
ENV DOCKER_BUILD=1

# GERÇEK SIR (secret) BUILD ZAMANINDA GEREKMEZ — env.ts doğrulaması
# (assertValidEnv) SADECE runtime'da, instrumentation.ts register()
# içinde çalışır; next build sırasında register() ÇAĞRILMAZ (bkz. o
# dosyanın notu). AMA: Next.js, "next build" sırasında sayfaları statik
# olarak toplarken (`Collecting page data`) sunucu bileşenlerini bir kez
# import/evaluate eder — packages/db/src/client.ts modül YÜKLENİRKEN
# `postgres(DATABASE_URL)` çağırır (bağlanmaz, sadece istemciyi kurar) ve
# DATABASE_URL boşsa throw eder. Bu yüzden build'in SÖZDİZİMSEL olarak
# geçerli (ama gerçek bir DB'ye bağlanmayan — postgres.js tembel bağlanır)
# placeholder değerlere ihtiyacı var. Gerçek dağıtımda bunlar
# `docker build --build-arg` ile ezilir (bkz. docs/deployment.md).
#
# ÖNEMLİ — NEXT_PUBLIC_* İSTİSNASI: Next.js, NEXT_PUBLIC_ önekli
# değişkenleri BUILD ZAMANINDA istemci paketine GÖMER (runtime'da
# docker-compose.prod.yml'in env_file'ı bunları DEĞİŞTİREMEZ). Bu yüzden
# gerçek bir dağıtımda NEXT_PUBLIC_BETTER_AUTH_URL (ve varsa
# NEXT_PUBLIC_SENTRY_DSN) MUTLAKA gerçek üretim değeriyle
# `docker build --build-arg NEXT_PUBLIC_BETTER_AUTH_URL=https://app.ornek.com`
# olarak verilmelidir — aksi halde tarayıcı kodu yanlış (build-time
# placeholder) URL'e istek atar. Diğer tüm değişkenler (DATABASE_URL,
# S3_*, BETTER_AUTH_SECRET) runtime'da env_file'dan GERÇEK değerle okunur,
# build-time değerleri sadece statik sayfa toplama sırasında modül
# başlatmayı hatasız geçirmek içindir.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
ARG BETTER_AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
ARG BETTER_AUTH_URL="http://localhost:3000"
ARG NEXT_PUBLIC_BETTER_AUTH_URL="http://localhost:3000"
ARG S3_ENDPOINT="http://localhost:9000"
ARG S3_BUCKET="ogun-documents"
ARG S3_ACCESS_KEY_ID="build-placeholder"
ARG S3_SECRET_ACCESS_KEY="build-placeholder"
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG NEXT_PUBLIC_SENTRY_DSN
ENV DATABASE_URL=${DATABASE_URL}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}
ENV NEXT_PUBLIC_BETTER_AUTH_URL=${NEXT_PUBLIC_BETTER_AUTH_URL}
ENV S3_ENDPOINT=${S3_ENDPOINT}
ENV S3_BUCKET=${S3_BUCKET}
ENV S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
ENV S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}
ENV NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
RUN pnpm turbo run build --filter=web...

# GÖREV 2'nin "migration-on-deploy" adımı için ayrı, DEV bağımlılıkları
# (drizzle-kit) İÇEREN bir hedef — production `runner` imajına drizzle-kit
# BİLEREK sızmaz (gereksiz boyut + saldırı yüzeyi). Kullanım:
#   docker build --target migrator -t ogun-migrator .
#   docker run --rm --env-file .env ogun-migrator
FROM installer AS migrator
WORKDIR /app/packages/db
CMD ["pnpm", "run", "db:migrate"]

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# `output: 'standalone'` (next.config.ts) çıktısı: sadece derlenmiş sunucu +
# GERÇEKTEN kullanılan node_modules dosyaları — tüm monorepo/pnpm store
# DEĞİL. public/ ve .next/static ayrıca kopyalanmalı (standalone bunları
# dahil ETMEZ, bkz. Next.js dokümantasyonu).
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone çıktısının server.js'i apps/web/ altında oluşur (monorepo'daki
# göreli konumu korunur) — bkz. .next/standalone/apps/web/server.js.
CMD ["node", "apps/web/server.js"]
