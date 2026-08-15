// Auth sayfaları (giriş, kayıt, şifre işlemleri) için ortak, ortalanmış kabuk.
// Uygulama kabuğu (kenar çubuğu vb.) Prompt 3.2'de app/(app)/layout.tsx olarak
// eklenecek — bu grup kasıtlı olarak ondan ayrı ve yalın tutuldu.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
