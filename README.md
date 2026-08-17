# ogun

pnpm + Turborepo ile yönetilen monorepo.

## Kurulum

1. Bağımlılıkları kurun:

   ```bash
   pnpm install
   ```

2. Ortam değişkenlerini ayarlayın:

   ```bash
   cp .env.example .env
   ```

3. Yerel Postgres'i başlatın:

   ```bash
   docker compose up -d
   ```

4. Geliştirme sunucularını çalıştırın:

   ```bash
   pnpm dev
   ```

## Dağıtım

Üretim dağıtımı (Vercel + Neon ya da self-hosted Docker + VPS), ortam
değişkeni doğrulaması ve yedekleme/kurtarma prosedürü için bkz.
[`docs/deployment.md`](docs/deployment.md) ve [`docs/runbook.md`](docs/runbook.md).
