// GitHub issue #35 / Prompt 6.1 — @ogun/pdf ana barrel. BİLEREK sadece
// tarayıcı-güvenli (node: bağımlılığı olmayan) parçaları dışa aktarır:
// tipler, DietPlanDocument bileşeni, font aile adı sabiti. Sunucu tarafı
// Buffer üretimi (node:fs kullanan font kaydı dahil) '@ogun/pdf/server'
// alt yolundan (bkz. package.json exports, render.ts) ayrı olarak dışa
// aktarılır — apps/web'in istemci önizleme bundle'ı (PDFViewer) bu barrel'ı
// import ettiğinde webpack'in node: modüllerini paketlemeye çalışmasını
// önlemek için (bkz. fonts.node.ts dosya başı notu).
export * from './types'
export { INTER_FONT_FAMILY } from './font-family'
export { DietPlanDocument } from './components/DietPlanDocument'
