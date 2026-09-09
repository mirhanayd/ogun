# Ogun Operasyon — Faz 3 destek operasyonları

Faz 3, klinik owner'larının Ayarlar içinden destek talebi oluşturabildiği ve Ogun Operasyon personelinin ayrı admin uygulamasında triage edip sonuçlandırabildiği clinic-scoped ticket sistemini ekler. Ticket'lar danışan veya sağlık kaydıyla ilişkilendirilmez; canonical kapsam yalnız `clinicId` ve `requesterUserId`'dir.

## Ticket lifecycle ve state machine

Canonical durumlar `submitted`, `triaged`, `in_progress`, `waiting_for_clinic`, `resolved`, `closed` ve `reopened`'dır. Geçiş grafiği tek `ADMIN_SUPPORT_TRANSITIONS` helper'ında tutulur ve her admin mutasyonunda server-side doğrulanır:

```text
submitted          → triaged | in_progress | waiting_for_clinic | resolved
triaged            → in_progress | waiting_for_clinic | resolved
in_progress        → waiting_for_clinic | resolved
waiting_for_clinic → in_progress | resolved
resolved           → closed | reopened
closed             → reopened
reopened           → triaged | in_progress | waiting_for_clinic | resolved
```

Klinik owner yalnız `resolved → reopened` yapabilir. `waiting_for_clinic` durumundaki owner yanıtı, mesaj ve event ile aynı transaction içinde ticket'ı `in_progress` durumuna taşır. `resolved` için admin tarafında public çözüm mesajı zorunludur; `closed` ticket'a klinik yanıtı kabul edilmez.

## Priority semantics

Klinik formu gerçek operasyon önceliğini göstermez veya kabul etmez. Owner yalnız `blocking`, `major`, `minor` ya da `suggestion` etkisini bildirir. `triagePriority` başlangıçta `null`'dır ve yalnız `tickets.manage` yetkili platform personeli tarafından `P1`–`P4` olarak atanır.

## Klinik görünürlük sınırı

Klinik route'ları `/ayarlar/destek` ve `/ayarlar/destek/[ticketId]` yalnız owner rolüne açıktır. Detail ve mesaj sorgularında `clinicId` zorunludur. Klinik projection'ı `triagePriority`, assignment, platform audit, notification delivery hatası ve internal metadata seçmez. Mesaj sorgusu `visibility = 'public'` koşulunu DB seviyesinde uygular; internal içerik RSC props, HTML/hydration payload veya e-postaya girmez.

Formdaki gizlilik uyarısı danışan adı, T.C. kimlik numarası ve gereksiz sağlık verisi paylaşılmamasını ister. Ticket modelinde `clientId`, tanı, ölçüm, plan veya laboratuvar bağı yoktur. Attachment, mesaj düzenleme ve silme bu fazda yoktur.

## Public ve internal mesajlar

Klinik kullanıcısının mesajları daima `public` kaydedilir. Platform personeli reply composer'da açıkça "Klinikle paylaş" veya "İç not — yalnız Ogun ekibi" seçer; varsayılan public'tir. `support_ticket_messages` exactly-one-author ve body length CHECK constraint'lerine sahiptir. İlk ticket açıklaması ayrı bir description alanında tekrar edilmez, ilk public mesajdır.

## Admin queue ve permissions

Admin `/destek` queue'su `tickets.read`, mutasyonlar `tickets.manage` gerektirir. Arama, status, priority, type, area, clinic, assigned staff, unassigned ve triage edilmemiş filtreleri URL query parametreleriyle DB'de uygulanır; pagination 25/50/100'dür. Varsayılan açık kuyrukta triage bekleyenler, sonra P1–P4 ve son aktivite sırası kullanılır.

`support` rolü read/manage, `read_only` yalnız read yetkisine sahiptir; `clinical_ops` support yetkisi almaz. Assignment hedefi aktif olmalı ve canonical permission matrix'e göre `tickets.manage` taşımalıdır.

## Event ve audit sınırı

`support_ticket_events` append-only business history'dir. `platform_audit_logs` ise platform personelinin priority, assignment, status, public reply ve internal note gibi privileged operasyonlarını kaydeder. DB-only admin mutasyonları business row + support event + success platform audit'i aynı transaction'da yazar. Audit metadata yalnız kimlikler ve from/to alanları içerir; mesaj body'leri kopyalanmaz.

## Email outbox

`support_email_notifications`, requester e-posta snapshot'ını ve `pending`, `sent`, `failed` delivery state'ini tutar. Ticket oluşturma transaction'ı ticket + ilk public mesaj + created event + pending notification yazar; commit sonrası `@ogun/email` ile gönderim denenir. Aynı sınır public reply, waiting-for-clinic, resolved, closed ve reopened bildirimlerinde kullanılır. Internal note, assignment, priority ve salt triage e-postası üretmez.

Provider hatası business transaction'ı rollback etmez; notification `failed` olur. Admin aynı kaydı retry edebilir, `attemptCount` artar ve retry audit'i yazılır. `sent` kayıt tekrar claim edilemez. Link origin'i yalnız server-side `OGUN_WEB_URL`'den alınır; recipient yalnız ticket requester'dır.

## Database ve migration

Migration `packages/db/drizzle/0033_wakeful_odin.sql` dokuz support enum'u ile `support_tickets`, `support_ticket_messages`, `support_ticket_events` ve `support_email_notifications` tablolarını; FK, CHECK, unique ve queue odaklı index'leri ekler. Migration destructive DDL içermez.

PostgreSQL 16 disposable container'da `pg_trgm` sonrası `0000`–`0033` zinciri, ana seed, clinical ETL, RxNorm mapping, Ogun food ETL ve E2E seed uygulanarak doğrulandı. Uzak veritabanına migration otomatik uygulanmadı.

## Environment

Yeni environment variable eklenmedi. E-posta linkleri mevcut `OGUN_WEB_URL`; teslimat mevcut `RESEND_API_KEY` ve `RESEND_FROM_EMAIL` yapılandırmasını kullanır.
