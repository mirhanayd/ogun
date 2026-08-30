# Masaüstü local-first mimarisi

## Değişmez kural: tek UI, birden çok veri kaynağı

Öğün Desktop çevrimiçi ve çevrimdışı durumda aynı paketlenmiş React renderer'ını,
route durumunu, `AppShellFrame` kabuğunu, ekranları, formları ve tasarım sistemini
kullanır. Ağ değişikliği renderer, WebView URL'si veya route değiştirmez ve sayfayı
yenilemez. `apps/desktop` Vite girişi doğrudan `apps/web/src` içindeki ortak ekran
ve component kaynaklarını paketler.

Eski `splash/offline.js` çalışma alanı, `DesktopOfflineBridge`, uzak UI preload'u
ve `show_offline_workspace` geçişi kaldırılmıştır. Yeni domain desteği için ayrı
bir “offline ekran” yazmak mimari ihlaldir; var olan screen bir repository
contract'ı üzerinden yerel kaynağa bağlanmalıdır.

```text
packaged Ogun UI → desktop repositories → encrypted local SQLite
                                           ↕
                                     background sync
                                           ↕
                                      Ogun Cloud
```

## Desktop offline nasıl açılır?

İlk kullanım çevrimiçi Better Auth girişi gerektirir. Girişten sonra clinic/user
kapsamı oluşturulur, `/api/desktop/workspace` initial pull'u tek SQLite
transaction'ıyla yerel tablolara yazılır, besin kataloğu indirilir ve cihaz PIN'i
ayarlanır. Sonraki cold start'ta internet yoksa kayıtlı hesap seçilir, PIN ile
cihaz profili açılır ve aynı `DesktopApp`/`AppShellFrame` component ağacı yerel
repository'lerden veri okur.

PIN bir bulut oturumu üretmez ve Better Auth'ın yerine geçmez. Yalnızca daha önce
online doğrulanmış user/clinic profilinin bu cihazdaki yerel verisine erişimi
açar. PIN 4–8 rakamdır, Stronghold'da rastgele salt ile Argon2id özeti tutulur;
beş hatalı denemeden sonra süreç içinde 30 saniye bekleme uygulanır.

## Local DB nerede ve hangi veriler local?

Veritabanı Tauri uygulama veri dizinindeki `ogun-local-v3.sqlite3` dosyasıdır.
Schema `schema_migrations` ile sürümlenir. Her klinik payload XChaCha20-Poly1305
ile bağımsız şifrelenir; anahtar Stronghold'daki device secret'tan türetilir.
SQLite şunları sağlar:

- `scopes`: user + clinic + role + capability kapsamı,
- `entities`: clinic metadata, clients, anamneses, measurements, lab results,
  goals, payments, plans, appointments ve custom foods,
- `outbox`: mutation kimliği, hedefi, işlem türü, şifreli payload, deneme ve hata,
- `sync_state`: son başarılı pull ve hata durumu,
- `foods`: klinik verisinden ayrı, normalize edilmiş ve indeksli katalog,
- `local_db_metadata`: katalog/schema metadatası.

Stronghold büyük JSON database değildir. Yalnızca native session, PIN doğrulama
materyali, cihaz profili ve encryption secret gibi küçük güvenlik verilerini
tutar. 0.3 öncesi Stronghold workspace/outbox/katalog kayıtları ilk açılışta
idempotent biçimde SQLite'a aktarılır ve kasadaki büyük payload'lar budanır.

## Scope ve yetkilendirme

Her entity ve outbox satırı `userId::clinicId::role` scope key'iyle bağlıdır.
Native komutlar, çağrının aktif online kullanıcıya veya PIN ile açılmış profile
tam olarak uyduğunu kontrol eder. Dietitian/assistant capability'leri owner gibi
genişletilmez. Sunucu pull kapsamını ve her push mutation'ını yeniden authoritative
olarak doğrular; offline olmak cloud yetkisini aşma imkânı vermez.

Açık “Çıkış yap” işlemi o kullanıcının SQLite scope satırını (cascade ile entity,
outbox ve sync state), Stronghold profilini ve native session token'ını kaldırır.
Uygulamayı kapatmak sadece bellekteki kilidi sonlandırır; restart-safe veri kalır.

## Sync, retry ve conflict

UI bütün okumaları yerel repository'den yapar. Desteklenen yazımda optimistic
entity projection'ı ile şifreli outbox envelope'u aynı SQLite transaction'ında
yazılır; transaction commit edilmeden UI başarı sinyali almaz. Mutation ID sabit
kalır ve uygulama yeniden başlatılsa da outbox'ta saklanır.

`online`, window focus, görünürlük, yerel mutation olayı ve 30 saniyelik periyot
sync engine'i uyandırır. Engine önce outbox'ı sıralı olarak POST eder, yalnız
sunucunun `appliedIds` cevabını siler, ardından güncel workspace'i pull edip
SQLite'ı transaction içinde değiştirir ve ortak UI'ya local-data-changed olayı
gönderir. Başarısız mutation exponential backoff ile `failed` kalır; en uzun
bekleme bir saattir.

Sunucudaki `desktop_mutation_receipts` primary key'i clinic + user + mutation
kimliğidir. Aynı mutation tekrar gelirse önceki sonuç döndürülür ve duplicate
kayıt oluşmaz. Cloud doğrulama/iş kuralı hataları deterministic olarak ilk hatalı
mutation'ı bloklar; randevu çakışması gibi kurallar sessiz last-write-wins ile
ezilmez. Başarılı pull cloud'un authoritative sonucunu yerel projection ile
uzlaştırır. Bu sırada route, renderer ve component tree aynı kalır.

## Food catalog nasıl offline çalışır?

Besin kataloğu UI belleğine tek büyük JSON snapshot olarak yüklenmez. İlk online
sync katalog sürümünü kontrol eder ve değişmişse satırları SQLite `foods`
tablosuna transaction ile yazar. Türkçe karakterlerden arındırılmış isim ve
search text indeksleriyle `search_local_foods` native sorgusu çalışır. Plan
içindeki ortak `FoodSearchInput` da aynı repository'yi kullanır. Cihazda bir
katalog varsa version endpoint'ine ulaşılamaması mevcut offline aramayı bozmaz.

## Offline kapsam ve bağlantı gerektiren işlemler

Panel özetleri, danışan listesi/detayı/araması/oluşturma/düzenleme, anamnez,
ölçüm, laboratuvar sonucu, hedef, plan listeleme/oluşturma/düzenleme/taslak,
randevu listeleme/oluşturma ve yerel besin arama/seçme SQLite üzerinden çalışır.
Assistant plan yazamaz; ekran aynı kalır ve mevcut tasarım diliyle salt okunur
olur.

E-posta/WhatsApp gönderimi, bulut dosya yükleme, Google OAuth, ödeme sağlayıcısı
ve sunucuda PDF paylaşım bağlantısı üretme gerçek bir harici alıcı gerektirir.
Bunlar çevrimdışıyken tamamlanmış gibi gösterilmez; bağlantı gelmesini bekler.

## Yeni bir domain offline desteğine nasıl eklenir?

1. `apps/web/src/data/repositories.ts` içindeki dar domain contract'ını genişlet.
2. Mevcut görünür screen/component'ı contract üzerinden çalıştır; kopya UI kurma.
3. Workspace pull payload'ına domain'i ve `workspaceToLocalDomains` listesine
   entity projection'ını ekle.
4. Native repository'de local read ile optimistic mutation/outbox mapping'ini
   ekle; role/capability kontrolünü koru.
5. Server sync route'unda payload validation, authoritative authorization,
   deterministic conflict ve receipt davranışını uygula.
6. Cold start, mutation, restart, reconnect, duplicate retry ve user isolation
   testlerini ekle.

Temel kabul testi şudur: ağ kablosu çekildiğinde açık route ve görünen Öğün UI
değişmiyorsa, veri yerelde kalıyorsa ve bağlantı döndüğünde arka planda
uzlaşıyorsa domain doğru katmana eklenmiştir.
