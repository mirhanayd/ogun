import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { UnauthenticatedError, requireAuth } from '@/lib/authz'

// Klinik onboarding akışı — TAM KAPSAMI Prompt 3.2'nin (Onboarding ve uygulama
// kabuğu, GitHub issue #11) konusu: klinik adı/telefon/adres, logo, marka
// rengi, çalışma saatleri adımları burada kurulacak. Bu, sadece kayıt/giriş
// sonrası yönlendirmenin kırık bir sayfaya düşmemesi için eklenmiş bir
// yer tutucudur.
async function getUserOrRedirect() {
  try {
    return await requireAuth()
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect('/giris')
    }
    throw error
  }
}

export default async function KurulumPage() {
  const { user } = await getUserOrRedirect()

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Hoş geldiniz, {user.name}</CardTitle>
          <CardDescription>Klinik kurulum sihirbazı yakında burada olacak.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Kliniğinizi oluşturma, logo yükleme ve marka rengi seçme adımları bir sonraki aşamada eklenecek.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
