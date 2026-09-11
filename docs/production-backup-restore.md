# Production Backup and Restore Runbook

Bu belge uygulama içine özel bir backup motoru eklemez; PostgreSQL/Neon native yetenekleri ile `pg_dump`/`pg_restore` kullanır. Sağlık verisi içeren yedekler production verisiyle aynı erişim, şifreleme, saklama ve imha kontrollerine tabidir.

## RPO ve RTO

- RPO (Recovery Point Objective): kabul edilebilir azami veri kaybı penceresi. PITR retention ve logical backup sıklığı buna göre seçilir.
- RTO (Recovery Time Objective): hizmetin doğrulanmış biçimde geri dönmesi için hedef süre. Restore süresi, veri boyutu ve doğrulama adımları düzenli drill ile ölçülür.

Bu değerler ürün/hukuk/operasyon sahibi tarafından onaylanmadan dokümandaki örnek süreleri SLA olarak sunmayın.

## Backup yaklaşımı

Neon kullanılıyorsa provider'ın point-in-time restore, retention, branch/isolated restore ve bölge özelliklerini aktif plan üzerinde doğrulayın. PITR birincil kısa dönem mekanizmadır. `scripts/backup-db.sh`, `pg_dump -Fc` ile bağımsız logical kopya üretir ve PITR'ın yerine değil, uzun dönem/taşınabilir tamamlayıcı olarak kullanılır.

Credential kuralları:

- Runtime pooled URL ile migration/restore direct URL'sini ayrı secret olarak tutun.
- URL'yi komut çıktısına, shell history'ye, artifact adına veya ticket'a yazmayın.
- Backup artifact'ını erişim kontrollü, şifreli ve production DB'den ayrı failure domain'de saklayın.
- Restore bittikten sonra geçici credential ve dosyaları güvenli biçimde kaldırın.

## Manual logical backup

```bash
DATABASE_URL=<source-direct-url> BACKUP_DIR=<encrypted-path> ./scripts/backup-db.sh
pg_restore --list <encrypted-path>/ogun-<timestamp>.dump > restore-manifest.txt
```

Dosya boyutu, `pg_restore --list`, checksum ve oluşturma zamanını change record'a yazın; credential veya satır içeriği yazmayın.

## İzole restore prosedürü

Production veritabanını drop/overwrite etmek yasaktır. Önce yeni, ağ ve erişim bakımından izole bir PostgreSQL 16 database/Neon branch oluşturun.

1. Hedefin production olmadığını hostname + database adıyla iki kez doğrulayın.
2. Gerekli `pg_trgm` ve `unaccent` extension'larını kurun.
3. Boş hedefe `pg_restore --no-owner --no-privileges --exit-on-error --dbname=<isolated-url> <dump>` çalıştırın.
4. Schema/table sayısı ve kritik tablolar (`clinics`, `users`, `clients`, `appointments`, `subscriptions`, `subscription_events`, `platform_audit_logs`, `operational_job_runs`) için aggregate count karşılaştırın.
5. FK/index varlığını, en son migration kaydını ve `select 1` readiness'i doğrulayın.
6. Restore hedefinde ileri migration gerekiyorsa [Database Write Safety](./database-write-safety.md) akışını kullanın. Remote Neon branch için hedefi `staging` olarak açıkça sınıflandırın, host/database eşleşmesini verin ve önce `db:migrate:check` çalıştırın; `db:push` kullanmayın.
7. Web/admin uygulamalarını delivery jobs kapalı olarak izole hedefe bağlayıp login ve read-only smoke yapın.
8. Sonucu, süreyi ve sapmaları kaydedin; test hedefini ve geçici backup'ı retention politikasına göre kaldırın.

## Production kurtarma kararı

İzole restore doğrulanmadan production'a yönlendirme yapılmaz. Trafiği durdurma, PITR zamanı, DNS/connection switch ve yeniden açma kararları incident commander tarafından kayıt altına alınır. Migration'ın her zaman geri alınabilir olduğunu varsaymayın: destructive veya veri dönüşümlü değişikliklerde forward-fix ve eski build uyumluluğu ayrıca değerlendirilir.

## Doğrulama checklist'i

- Backup kaynağı ve hedef environment doğru.
- Artifact checksum/manifest okunabilir.
- Restore yalnız boş/izole hedefe yapıldı.
- Critical table counts kaynakla eşleşti.
- Constraint ve index'ler mevcut.
- Web/admin readiness başarılı.
- Cron ve external delivery kapalı kaldı.
- Test credential/artifact temizlendi.
- RPO/RTO ölçümü ve drill tarihi kaydedildi.

11 Eylül 2026 Faz 7 disposable PostgreSQL 16 drill'i başarıyla tamamlandı. `pg_dump -Fc` çıktısı yeni `ogun_phase7_restore` veritabanına yüklendi; users, clinics, foods, conditions ve Faz 7 operasyon tablolarının kaynak/restore sayıları birebir eşleşti. Exact count'lar `docs/admin-phase-7-status.md` ile kök `walktrough.md` içindedir.
