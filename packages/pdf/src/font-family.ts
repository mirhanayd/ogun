// Tarayıcıda VE Node'da ortak, node: bağımlılığı olmayan tek sabit — bkz.
// fonts.node.ts dosya başı notu (neden font KAYDI ile font AİLESİ ADI'nın
// ayrı dosyalara bölündüğü). DietPlanDocument bileşeni SADECE bu aile adını
// stil olarak kullanır, gerçek Font.register çağrısını YAPMAZ — kayıt,
// çalışıldığı ortama göre (Node: fonts.node.ts, tarayıcı: apps/web'in kendi
// register-pdf-fonts-client.ts'i) ayrı ayrı yapılır.
export const INTER_FONT_FAMILY = 'Inter'
