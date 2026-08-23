# Masaüstü çevrimdışı çalışma mimarisi

## Hedef

Öğün masaüstü uygulaması ağ kesildiğinde açık ekranda kalmakla yetinmez.
Uygulama yeniden başlatıldığında da cihazdaki hesap seçilebilir, yerel PIN ile
açılabilir ve klinik çalışması sürdürülebilir. Sunucuya ulaşamayan yazımlar
uygulama sürecinde değil, diskteki şifreli işlem günlüğünde bekler.

## Veri akışı

1. Tauri üretimde paketlenmiş `apps/desktop/splash/index.html` çalışma alanını
   açar.
2. Ağ erişimi varsa canlı web uygulamasına geçilir. Başarılı oturum
   `DesktopOfflineBridge` üzerinden cihaz profilini ve klinik snapshot'ını
   günceller.
3. İlk girişte 4-8 rakamlı cihaz PIN'i istenir. PIN'in kendisi saklanmaz;
   Argon2id özeti Stronghold kasasına yazılır.
4. Ağ yoksa paketlenmiş çalışma alanı profil + PIN seçimini gösterir. Başarılı
   doğrulama yalnızca o uygulama süreci için kasayı açar.
5. Yerel yazımlar önce snapshot'a, sonra tekrar oynatılabilir mutasyon
   günlüğüne yazılır. Her iki yazım da tamamlanmadan arayüz kaydı başarılı
   kabul etmez.
6. Bağlantı döndüğünde `/api/desktop/workspace` mutasyonları sırayla uygular.
   Başarılı kimlik eşlemeleri kalan ilişkilere işlenir; yalnızca sunucunun
   onayladığı günlük kayıtları silinir.

## Güvenlik ve kiracı sınırı

- Installer'a `DATABASE_URL`, Better Auth secret veya başka sunucu sırrı
  konmaz.
- Profil, snapshot, PIN özeti ve günlük aynı Stronghold snapshot'ındadır.
- PIN 4-8 rakamdır, Argon2id ve rastgele salt kullanır. Beş hatalı denemeden
  sonra 30 saniyelik süreç-içi kilit uygulanır.
- Senkron endpoint'i kullanıcı/klinik kapsamını oturumdan türetir. İstemciden
  clinicId kabul etmez; davetli diyetisyen yalnızca atanmış danışanlarını alır.
- Yeni yerel danışan kaydında KVKK aydınlatma ve özel nitelikli sağlık verisi
  açık rızası ayrı ayrı zorunludur.
- Açıkça çıkış yapmak cihaz profiliyle beraber çevrimdışı snapshot'ı siler.
  Uygulamayı normal kapatmak silmez.

## Çakışma ve tekrar deneme

- Yeni yerel danışan, plan ve randevu kimlikleri sunucuda da aynı opak metin
  kimliğiyle kullanılır. Yanıt alınamayıp aynı işlem tekrar gönderilirse yeni
  bir kopya oluşturulmaz.
- Plan editörü tüm son taslağı sabit `plan-draft:<planId>` günlük anahtarıyla
  coalesce eder. Böylece yüzlerce tuş vuruşu yerine yalnızca son tutarlı ağaç
  yeniden oynatılır.
- Randevu eşitlemesi aynı diyetisyenin çakışan aktif randevusunu fark ederse
  kaydı cihazda bekletir ve kullanıcıya hata gösterir; sessizce üzerine yazmaz.

## Bağlantı gerektiren işlemler

Yerel klinik kaydı üretmeyen veya harici bir alıcıya ulaşan e-posta/WhatsApp
gönderimi, buluta belge yükleme, Google OAuth ve sunucu tarafından PDF
paylaşım bağlantısı oluşturma bağlantı gelene kadar çalıştırılmaz. Bunlar
yerel olarak "gönderildi" gösterilmez. Plan taslağı ve klinik kayıtları ise
bağlantıdan bağımsız olarak cihazda kalır.
