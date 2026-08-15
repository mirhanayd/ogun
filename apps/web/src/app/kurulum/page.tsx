import { requireAuth } from '@/lib/authz'

// Klinik onboarding akışının yer tutucusu. Adımların tamamı (klinik bilgileri,
// logo/marka rengi, çalışma saatleri) issue #11 "Onboarding ve uygulama
// kabuğu" kapsamında burada inşa edilecek — bu sayfa sadece kayıt sonrası
// yönlendirmenin 404 vermemesi için var.
export default async function KurulumPage() {
  const auth = await requireAuth()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="text-2xl font-semibold text-primary">Öğün&apos;e hoş geldiniz, {auth.name}</span>
      <p className="max-w-sm text-muted-foreground">
        Klinik kurulum akışı yakında burada olacak. Şimdilik hesabınız oluşturuldu.
      </p>
    </main>
  )
}
