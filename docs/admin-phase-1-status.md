# Admin Faz 1 durum / devam notu

Bu dosya, çalışma oturumu yarıda kesilirse sonraki Codex oturumunun güvenli biçimde devam edebilmesi içindir.

## Durum

- DB/auth foundation commit: `e4ac566`
- Ayrı admin app + auth/MFA commit: `4ed16df`
- RBAC + platform audit commit: `df66e8f`
- Dokümantasyon/test commit'i bu dosyayla birlikte oluşturulacak; hash için `git log -1` kullanın.
- Kullanıcıya ait başlangıç değişiklikleri `.gitignore`, `ogun-clinical-db-integration/`, `packages/etl/src/importers/clinical.ts`, `packages/etl/src/verify-clinical.ts` ve `scripts/apply-clinical-integration.mjs`; bunlara dokunulmadı ve commitlere alınmadı.

## Son doğrulama sırası

1. `pnpm --filter @ogun/db typecheck` ve `test`
2. Geçici, gerçek olmayan en az 32 karakterli `ADMIN_BETTER_AUTH_SECRET` ile admin `typecheck`, `lint`, `test`, `build`
3. Mümkünse root `typecheck`, `lint`, `test`; önceden mevcut hata varsa kaynağını ayır
4. `git status --short` ve `git log --oneline -10`
5. Remote/branch uygunsa yalnızca oluşturulan commitleri push et

## 2026-09-08 doğrulama sonucu

- `pnpm --filter @ogun/db typecheck`: geçti
- `pnpm --filter @ogun/db test`: geçti (22 test, 50 mevcut koşullu skip)
- Admin `typecheck`: geçti
- Admin `lint`: geçti, uyarı yok
- Admin `test`: geçti (13 test)
- Admin production `build`: geçti
- Root `typecheck`: geçti (8 task)
- Root `lint`: geçti (3 task)
- Root `test`: başarısız. `.env` uzak Neon veritabanına işaret ediyor ve migration 0031 henüz uygulanmadığı için ETL entegrasyon testleri `users.two_factor_enabled does not exist` verdi; ayrıca `rxnorm-db.test.ts` 5 saniyede timeout oldu. Uzak DB'ye otomatik migration uygulanmadı. Migration uygulandıktan sonra root test yeniden çalıştırılmalı.

## Tasarım kararları

- Better Auth 1.6.29 kurulu paketinden doğrulandı: core session `modelName: 'adminSession'`, Drizzle `usePlural: true` ile `adminSessions`; two-factor modeli `twoFactor` ile `twoFactors` export'una çözülür.
- Better Auth 1.6.29 plugin şeması doğrultusunda `users.twoFactorEnabled` ile `two_factors.secret`, `backupCodes`, `userId`, `verified`, `failedVerificationCount`, `lockedUntil` kullanıldı.
- `ADMIN_BETTER_AUTH_SECRET` eksikse uygulama fail-fast davranır; web secret'ına örtük fallback engellendi.
- Bootstrap CLI var olan kullanıcıyı idempotent biçimde grant/revoke eder ve audit yazar.
- Admin browser mutation UI bilinçli olarak eklenmedi; personel ekranı salt okunur.
