# Ogun Operasyon — Faz 2 durumu

Faz 2, Faz 1 platform auth/RBAC sınırını değiştirmeden cross-tenant tenancy ve hesap operasyonlarını ekler. Canonical authorization hâlâ her server request/action içinde `requirePlatformPermission(...)` ile yapılır; normal web uygulamasının `requireClinic()` veya `ClinicScope` modeli admin yetkisi olarak kullanılmaz.

## Operasyon ekranları

- `/klinikler`: DB tarafında arama, plan, abonelik durumu, faturalama ve onboarding filtresi; 25/50/100 server pagination.
- `/klinikler/[clinicId]`: Genel, Kullanıcılar, Oturumlar, Cihazlar ve read-only Abonelik tabları.
- `/kullanicilar/[userId]?clinicId=...`: üyelikler, yalnız normal web/desktop oturumları ve Ogun Desktop cihazları.
- Tek oturum ve tüm normal oturumları sonlandırma, cihaz iptal/yeniden etkinleştirme ve şifre sıfırlama e-postası işlemleri permission kontrollüdür.

Admin sorguları `accounts.password`, OAuth tokenları, `sessions.token`, verification tokenları, TOTP secret/yedek kodları ve raw installation ID seçmez. Danışan, ölçüm, laboratuvar, tanı, klinik not veya diyet planı tabloları bu ekrana bağlanmamıştır.

## Transaction ve audit

Session revoke, tüm session revoke, device revoke ve device reactivate işlemlerinde business mutation ile success `platform_audit_logs` kaydı aynı DB transaction'ındadır. Audit FK yazımı başarısız olduğunda session silmenin rollback olduğu disposable PostgreSQL entegrasyon testiyle doğrulanır. Failure audit action katmanında ayrıca yazılır.

Password reset harici e-posta operasyonudur: admin action sabit `OGUN_WEB_URL` origin'inde Better Auth 1.6.29 resmi request endpoint'ini çağırır; tokenı üretmez, görmez veya loglamaz. Başarı/failure audit kayıtlarında yalnız user entity bulunur. Aynı kullanıcı için başarılı istekten sonra server-side 60 saniye cooldown uygulanır.

## Email

Transactional gönderici sözleşmesi ve Resend implementasyonu `@ogun/email` workspace paketine taşındı. Normal web paylaşım ve davet çağrıları bu paketi kullanır. Better Auth `sendResetPassword` callback'i Türkçe HTML/metin şablonunu Resend'e yollar ve provider hatasını yutmaz.

## Device registry

`devices`, `device_user_links` ve `device_sessions` canonical PostgreSQL tablolarıdır. Bir kurulum birden çok kullanıcıyla, bir kullanıcı birden çok kurulumla ilişkilendirilebilir. Session FK yalnız normal `sessions` tablosunadır ve session silinince cascade olur.

Desktop, ilk açılışta 256 bit CSPRNG değeri üretip `ogun-installation-id` anahtarıyla Stronghold'a yazar. Kimlik MAC/hardware fingerprint veya auth secret değildir. İsteklerde `X-Ogun-Device-Id` olarak normal Better Auth bearer yanında taşınır; sunucu auth'u her zaman session'dan çözer, raw değeri SHA-256 ile hashler ve yalnız 10 karakter fingerprint gösterir. Last-seen yazımları 10 dakikaya throttle edilir.

Revoked cihazın bağlı normal session'ları kapanır ve aynı installation ID ile sonraki Better Auth isteği engellenir. Başlıksız normal browser auth akışı cihaz kontrolüne girmez. Reactivate yeni login'e izin verir; önceki iptal geçmişi append-only audit'te kalır.

## Migration ve ortam

Migration: `packages/db/drizzle/0032_panoramic_lockjaw.sql`. Yeni env: `OGUN_WEB_URL`; mail için mevcut `RESEND_API_KEY` ve `RESEND_FROM_EMAIL` ortak paket tarafından kullanılır. Remote veritabanının hedefi kesin sınıflandırılmadığından migration otomatik uygulanmaz; release sırasında kontrollü olarak `pnpm --filter @ogun/db db:migrate` çalıştırılmalıdır.

## Doğrulama özeti

- Boş disposable PostgreSQL 16 üzerinde `0000`–`0032` migration zinciri ve ürün seed/ETL adımları geçti.
- Kök typecheck ve lint geçti.
- Paket testleri toplam 876 başarılı, 6 atlandı; ayrıca Playwright 10 başarılı, 1 paketli Tauri release testi atlandı.
- Web ve admin production build'leri geçti. Web build'inde mevcut Sentry/Turbopack external uyarıları devam ediyor; derlemeyi başarısız kılmıyor.
- Gerçek Better Auth reset token üretme, gönderim callback'i, token tüketme ve hashlenmiş credential oluşturma zinciri disposable DB üzerinde geçti.
- Admin HTTP smoke; filtreli liste, klinik/kullanıcı detayları, 403 permission boundary, tek/tüm normal session revoke, device revoke/reactivate ve reset cooldown işlemlerinde geçti.
- Bu çalışma ortamında bağlanabilir etkileşimli browser yüzeyi bulunmadığı için admin browser-driven UI smoke `NOT RUN` olarak kaydedildi.
