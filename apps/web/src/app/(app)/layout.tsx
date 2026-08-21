import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import { hasCompletedProductTour } from '@ogun/db/queries'
import { NativeNotificationBridge } from '@/components/native-notification-bridge'
import {
  ClinicSelectionRequiredError,
  NoActiveClinicError,
  UnauthenticatedError,
  requireClinic,
} from '@/lib/authz'
import { OfflineIndicator } from '@/components/offline-indicator'
import { BottomNav } from './_components/bottom-nav'
import { DesktopTitlebar } from './_components/desktop-titlebar'
import { ProductTour } from './_components/product-tour'
import { ScreenTimeTracker } from './_components/screen-time-tracker'
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
    // GitHub issue #67 — requireClinic() artık tek üyelikte kliniği kendisi
    // seçiyor; buraya yalnızca GERÇEKTEN hiç kliniği olmayan (sihirbaza
    // gitmesi gereken) veya birden fazla klinik arasından seçim yapması
    // gereken kullanıcılar düşer.
    if (error instanceof ClinicSelectionRequiredError) redirect('/klinik-sec')
    if (error instanceof NoActiveClinicError) redirect('/kurulum')
    throw error
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppShellContext()
  // GitHub issue #47 / Prompt 8.3, GÖREV 1 — "İlk girişte 4 adımlı ürün
  // turu". users.productTourCompletedAt NULL'sa (bkz. schema/tenancy.ts)
  // tur gösterilir — bu kontrol layout'ta (her sayfa yüklemesinde) YAPILIR,
  // ama tur SADECE bir kez (tamamlanana/atlanana kadar) render edilir.
  const showProductTour = !(await hasCompletedProductTour(db, ctx.user.id))

  return (
    <div className="flex h-svh min-h-0 flex-col overflow-hidden bg-background" data-app-shell>
      <DesktopTitlebar role={ctx.role} userName={ctx.user.name} userEmail={ctx.user.email} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="app-sidebar hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="flex h-[4.5rem] items-center gap-3 px-5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_22px_-10px_var(--primary)]">
              <span className="text-base font-semibold">ö</span>
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-[-0.025em] text-sidebar-foreground">
                öğün
              </p>
              <p className="text-[10px] font-medium tracking-[0.13em] text-muted-foreground uppercase">
                Klinik OS
              </p>
            </div>
          </div>
          <SidebarNav role={ctx.role} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            activeClinicId={ctx.scope.clinicId}
            role={ctx.role}
            userName={ctx.user.name}
            userEmail={ctx.user.email}
          />
          <main className="app-main flex-1 overflow-y-auto px-4 py-5 pb-20 sm:px-6 md:pb-7 lg:px-8">
            <div className="mx-auto w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
      </div>
      <BottomNav role={ctx.role} />
      {/* GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — "Çevrimdışı
          göstergesi: plan editöründe var, uygulama geneline yay." Plan
          editörünün kendi kaydetme durumu rozeti (bkz. plan-editor.tsx
          SaveStatusIndicator) KALDIRILMADI; bu gösterge ondan FARKLI bir
          şeyi söylüyor — bağlantının kendisi yok, yani hiçbir ekranda
          kaydetme/yenileme çalışmaz. */}
      <OfflineIndicator />
      <ScreenTimeTracker />
      {showProductTour && <ProductTour />}
      {/* GitHub issue #53 / Prompt 9.3, GÖREV 3 — kimlik doğrulaması VE aktif
          klinik ZATEN garanti (bkz. yukarıdaki getAppShellContext) burada
          monte ediliyor; kök layout.tsx'e KOYMADIK çünkü /giris, /p/[token]
          gibi genel sayfalarda klinik bağlamı yok, bildirim özeti anlamsız
          olurdu. Web tarayıcısında (isNativeShell() false) bu bileşen NO-OP. */}
      <NativeNotificationBridge />
    </div>
  )
}
