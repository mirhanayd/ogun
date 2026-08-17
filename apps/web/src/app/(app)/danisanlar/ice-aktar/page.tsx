import { ClientImportWizard } from './client-import-wizard'

// GitHub issue #47 / Prompt 8.3, GÖREV 3 — "Veri göçü aracı". Ayrı bir sayfa
// (danisanlar/page.tsx'teki "Yeni danışan" akışının YANINDA, onun YERİNE
// değil — bkz. o sayfadaki "İçe aktar" bağlantısı) çünkü çok adımlı bir
// sihirbaz (yükle → eşle → önizle/hatalı satır raporu → onayla), tek
// sayfalık hızlı formla (yeni/page.tsx) aynı bileşene sığdırılamaz.
export default function ImportClientsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Danışan listesini içe aktar</h1>
        <p className="text-sm text-muted-foreground">
          CSV dosyanızı yükleyin, sütunları eşleyin ve önizleyin. Ad/soyad zorunludur; telefon, doğum
          tarihi ve kilo geçmişi isteğe bağlıdır.
        </p>
      </div>
      <ClientImportWizard />
    </div>
  )
}
