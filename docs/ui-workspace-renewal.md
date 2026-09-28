# Ogun klinik çalışma alanı

## Tasarım kararları

Mevcut Ogun logosu, Inter/sistem font yığını ve klinik marka renkleri korunur.
Varsayılan eylem rengi #1B7A5A; marka ailesi #4FA97F, #9FE1CB ve #12211B.
Yüzeyler mevcut düşük doygunluklu OKLCH nötrlerinden türetilir. Klinik rengi
ikon/eylem yüzeylerinde kendi hesaplanmış kontrast rengiyle kullanılır; grafik
ve klinik durum renkleri markadan bağımsız kalır.

24px sayfa başlığı, 18px bölüm, 14px gövde, 12px yardımcı metin. Sayısal
veriler tabular-nums. Yüzey 12px, denetim 8px köşe; gölge sadece katman
ayrımı için. Dekoratif arka plan gradyanları yok.

```
klinik / menü   | sayfa başlığı             işlemler
240px / 76px   | arama ve filtreler
               | tablo / dar ekranda kayıt listesi
               | sonuç sayısı             sayfalama
```

Profilde kimlik ve gerçek ölçüm özeti üstte, hızlı işlemler sekmelerden önce,
klinik modüller tam genişlikte. Mobilde alt gezinme ve Diğer menüsü korunur.
Daraltılan sidebar etiketleri erişilebilir kalır; tercih yalnızca cihazda saklanır.

Değişiklikler ortak web/Tauri sunum bileşenlerindedir. Veritabanı, API,
yetkilendirme, beslenme hesapları, içe aktarma ve senkronizasyon sözleşmeleri
bu tasarımın kapsamı dışındadır. Üretime dağıtım yapılmaz.

## Uygulanan alanlar

- Kalıcı daraltma tercihi, klavye tooltip'leri, içerik atlama bağlantısı ve
  role göre mevcut bağlantıları kullanan ortak web/Tauri sidebar.
- Merkezi Ogun SVG ailesi; mevcut logo dosyaları değişmedi.
- Danışan arama/filtre/sonuç sayısı, seçili satırlar, seçim kaldırma, mobil
  seçim alanları ve işlem sırasında tekrar gönderimi engelleme.
- Yerel listede yükleme, hata/tekrar deneme ve cihaz kayıtları açıklaması.
- Yeni danışan ve genel bilgi formları; hata/başarı bildirimleri ve form etiketleri.
- Profil kimliği, gerçek özet değerler, mevcut hızlı işlem yuvası, metinli
  klinik bildirimler ve sekiz erişilebilir klinik sekme.
- Ölçüm girişi/geçmişi, beslenme planı listesi ve ortak form yüzeyleri.
- Panel, randevular, planlar, besin/tarif kataloğu, finans ve ayar başlıkları.

Mevcut liste sıralaması korunur; sunucuda olmayan bir sıralama API'si veya
yalnızca görünen sayfayı sıralayan yanıltıcı bir denetim eklenmedi.

## Tekrarlanabilir doğrulama

```
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web exec vitest run --maxWorkers=2
pnpm --filter web build
pnpm --filter desktop typecheck
pnpm --filter desktop test
pnpm --filter desktop exec tauri build --no-bundle
node --test apps/desktop/scripts/production-css.test.mjs apps/desktop/scripts/production-layout.test.mjs
```

Web test sonucu: 456 başarılı, 5 atlanan. Atlananlar mevcut koşullu destek
e-postası, parola sıfırlama, iyzico webhook ve analitik testleridir. Masaüstü
çevrimdışı mimari regresyonları: 15 başarılı.

Son kontrol: web typecheck/lint/build, masaüstü typecheck, Vite üretim
build'i, Tauri release `--no-bundle` build'i ve üç üretim CSS/tarayıcı testi
başarılı. Tauri çıktısı: `apps/desktop/src-tauri/target/release/ogun-desktop.exe`.
Vite büyük paket/dinamik import uyarıları devam eder; bu görevde paketleme
mimarisi veya bağımlılıklar değiştirilmedi.

Playwright: üretim Vite paketinde 1440/900/390px, açık/koyu tema, web/native
kabuk, açık/kapalı sidebar, tercih kalıcılığı, tooltip klavye erişimi, sekme
ok tuşları, taşma kontrolü, arama/boş sonuç, atama, arşivleme, form doğrulama,
yeni kayıt, yükleme hatası ve role göre menü görünürlüğü. Ayrıca ana metin
ve eylem renklerinde 4.5:1, form sınırlarında 3:1 kontrast, iki farklı klinik
vurgu rengi, reduced-motion ve mobil Diğer menüsü denetlenir.

Tarayıcı testi mevcut `layout-smoke` girişini ve gerçek ortak ekranları
kullanır; bağımlılığı enjekte edilen bellek deposu yalnızca test verisi
içerir. Veritabanına, gerçek API'ye ve native SQLite'a bağlanmaz. Web
görünümü aynı üretim bileşenlerinin web kabuğudur; Next oturum açma + sunucu
aksiyonları ve gerçek WebView/SQLite eşitlemesi uçtan uca yeniden denenmedi.
Next kendi Inter dosyasını yükler; Vite fixture web görünümünde belgelenmiş
sistem fontu yedeği kullanılır. Tauri `--no-bundle` çalıştırılabilir dosyayı
derler; imzalı kurulum paketi veya dağıtım üretmez.

## Görsel kanıt

Test, depo köküne göre `artifacts/ui/` altında 32 PNG üretir. Bunlar gerçek
danışan verisi içermez ve Git'e eklenmez. Örnekler:

- `artifacts/ui/clients-web-light-1440.png`
- `artifacts/ui/profile-web-light-1440.png`
- `artifacts/ui/sidebar-collapsed-web-light-1440.png`
- `artifacts/ui/profile-web-dark-390.png`
- `artifacts/ui/clients-desktop-dark-900.png`

Kalite incelemesi frontend-design, React Best Practices ve
[Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
üzerinden yapıldı. Bağımlılık, Next/React sürümü, migration, production
verisi veya platform yönetici/pazarlama ekranlarında değişiklik yapılmadı.
