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
