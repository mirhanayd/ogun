import { redirect } from 'next/navigation'
import { NoActiveClinicError, UnauthenticatedError, requireClinic } from '@/lib/authz'
import { BottomNav } from './_components/bottom-nav'
import { SidebarNav } from './_components/sidebar-nav'
import { TopBar } from './_components/top-bar'

// Uygulama kabuğu (Prompt 3.2, GitHub issue #11): sol kenar çubuğu (masaüstü)
// + alt navigasyon (mobil) + üst bar (klinik seçici, komut paleti, kullanıcı
// menüsü). Bu route group'un TAMAMI kimlik doğrulaması VE aktif bir klinik
// gerektirir — ikisinden biri eksikse ilgili sayfaya yönlendirir.
async function getAppShellContext() {
  try {
    return await requireClinic()
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect('/giris')
    if (error instanceof NoActiveClinicError) redirect('/kurulum')
    throw error
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppShellContext()

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border md:flex">
        <div className="flex h-14 items-center px-4 text-lg font-semibold text-primary">Öğün</div>
        <SidebarNav role={ctx.role} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          activeClinicId={ctx.scope.clinicId}
          role={ctx.role}
          userName={ctx.user.name}
          userEmail={ctx.user.email}
        />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">{children}</main>
      </div>
      <BottomNav role={ctx.role} />
    </div>
  )
}
