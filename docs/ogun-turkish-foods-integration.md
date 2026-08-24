# Öğün Türk Yemekleri entegrasyon kontrol listesi

Bu belge `packages/etl/data/ogun` altındaki kullanıcı kaynaklı Türk yemekleri
verisinin üretim ve çevrimdışı kullanım durumunu izler. Kaynak CSV'ler kişisel
ve ham veri oldukları için Git'e eklenmez; yeniden çalıştırılabilir importer,
eşleme ve doğrulama kuralları sürümlenir.

## Veri denetimi

- [x] 119 yemek, 708 malzeme ve 2.380 porsiyon-besin satırını doğrula.
- [x] Her yemeğin 20 besin öğesine ve pozitif porsiyon ağırlığına sahip olduğunu doğrula.
- [x] Yetim malzeme, tekrar eden kaynak kimliği ve eşlenmemiş birim/kod denetimlerini ekle.
- [x] Yetişkin ve çocuk/adölesan tablolarının yaş/cinsiyet yüzdeleri olduğunu doğrula.
- [x] Yaş/cinsiyet yüzdelerini gıda kompozisyonu değerlerine karıştırma; OCR kalite denetiminde tut.
- [x] Enerjiyi makrolardan Atwater yaklaşımıyla denetle ve sapmayı `%10` üstünde durdur.
- [x] Kaynak sayfalarla kanıtlanan 14 OCR düzeltmesini kapalı ve test edilebilir listede tut.
- [ ] Ham kaynak ve OCR çıktısını diyetisyen/veri sorumlusu ile ikinci kez gözden geçir.
- [ ] `MEDIUM`/`LOW` kalite bayraklarını kaynak sayfalarla tek tek kapat.

## Veritabanı ve beslenme hesabı

- [x] `OGUN` veri kaynağı kodunu şemaya ve seed'e ekle.
- [x] Toplam omega-3, toplam omega-6 ve folik asidi doğru ayrı besin kodlarına eşle.
- [x] Porsiyon değerlerini gram ağırlığıyla 100 grama normalize et.
- [x] OCR kökenini `isImputed=true`, yemeği `isVerified=false` ve açıklama notuyla şeffaflaştır.
- [x] İdempotent importer ve salt-okunur audit komutlarını ekle.
- [x] Neon enum migration'ını uygula.
- [x] Neon'a 119 yemek, 2.380 besin değeri ve 119 varsayılan porsiyon yaz.
- [x] Neon'da kaynak bazında sayıları ve örnek makro/mikro değerlerini sorguyla doğrula.

## Web ve masaüstü çevrimdışı kullanım

- [x] Besin API'sinin tüm tercih edilen makro/mikro değerleri istemci indeksine taşıdığını doğrula.
- [x] `OGUN` kayıtlarının 119'unun da web besin indeksine ve tercih edilen besin değerlerine katıldığını doğrula.
- [x] Ağ yokken mevcut Dexie besin indeksine geri düşmeyi güvenceye al ve test et.
- [ ] Masaüstü uygulama yeniden açıldığında kayıtlı besin kataloğunun kullanılmasını doğrula.
- [ ] Çevrimdışı oluşturulan plan değişikliklerinin kalıcı kuyruğa yazılıp bağlantıda eşitlendiğini doğrula.

## Yayın kontrolü

- [x] Importer birim testleri ve TypeScript tip kontrollerini çalıştır.
- [x] Web testlerini ve production build'i çalıştır.
- [x] Desktop Rust kontrollerini çalıştır; kullanıcı istemediği sürece installer build etme.
- [ ] Mantıksal değişiklikleri ayrı commit'lere ayır ve `origin/master`'a push et.

## Komutlar

```powershell
pnpm --filter @ogun/etl etl:ogun:audit
pnpm --filter @ogun/db db:migrate
pnpm --filter @ogun/etl etl:ogun
```

`etl:ogun` yalnız audit başarılı olduktan sonra veritabanına yazar ve tekrar
çalıştırıldığında aynı `OGUN-001`…`OGUN-119` kaynak kimliklerini günceller.
