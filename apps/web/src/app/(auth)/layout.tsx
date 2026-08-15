export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <span className="text-2xl font-semibold text-primary">Öğün</span>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  )
}
