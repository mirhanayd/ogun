import { defineConfig } from 'vitest/config'

// apps/web'in ilk vitest kurulumu (bkz. src/lib/audit.test.ts — GitHub issue
// #12 / Prompt 3.3). DATABASE_URL burada bir DUMMY değer: @ogun/db/client.ts
// modül yüklenirken (import zamanında) bu değişkenin VAR OLMASINI şart
// koşuyor, ama postgres.js sürücüsü tembel bağlanır (ilk sorguya kadar TCP
// açmaz) — audit.test.ts gerçek bir DB'ye hiç dokunmuyor (recorder enjekte
// ediliyor), bu yüzden gerçek bir Postgres'in ayakta olmasına gerek yok.
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/ogun_test',
    },
  },
})
