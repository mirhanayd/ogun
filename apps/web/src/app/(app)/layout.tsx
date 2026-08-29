import { redirect } from 'next/navigation'
import { db } from '@ogun/db'
import {
  getClinicById,
  getSubscriptionSelectionForUser,
  hasCompletedProductTour,
} from '@ogun/db/queries'
import { NativeNotificationBridge } from '@/components/native-notification-bridge'
import { AppShellFrame } from '@/components/app-shell-frame'
import { DesktopOfflineBridge } from '@/components/desktop-offline-bridge'
import { ConnectivityStatusProvider } from '@/components/connectivity-status-provider'
import {
  ClinicSelectionRequiredError,
  NoActiveClinicError,
  UnauthenticatedError,
  requireClinic,
} from '@/lib/authz'
import { OfflineIndicator } from '@/components/offline-indicator'
import { requiresSubscriptionPayment } from '@/lib/subscription/access'
import { getClinicBrandingVariables } from '@/lib/clinic-branding'
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
  const [hasCompletedTour, clinic, planSelection] = await Promise.all([
    hasCompletedProductTour(db, ctx.user.id),
    getClinicById(db, ctx.scope.clinicId),
    getSubscriptionSelectionForUser(db, ctx.user.id),
  ])
  // Plan zorunluluğundan önce açılmış trial hesapların plan seçimi yoktur;
  // onları ödeme ekranına göndermek sonsuz yönlendirme döngüsü oluşturur.
  // Yeni akışta plan seçimi bulunan hesap ödeme tamamlanana kadar burada tutulur.
  if (clinic && requiresSubscriptionPayment(clinic.subscriptionStatus, planSelection !== null)) {
    redirect('/odeme')
  }
  const showProductTour = !hasCompletedTour
  const clinicName = clinic?.name ?? 'Klinik'
  const clinicInitials = clinicName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('tr-TR')

  return (
    <ConnectivityStatusProvider>
      <AppShellFrame
        clinicName={clinicName}
        clinicLogoUrl={clinic?.logoUrl}
        clinicInitials={clinicInitials}
        userName={ctx.user.name}
        brandingStyle={getClinicBrandingVariables(clinic?.primaryColor)}
        desktopTitlebar={
          <DesktopTitlebar role={ctx.role} userName={ctx.user.name} userEmail={ctx.user.email} />
        }
        navigation={<SidebarNav role={ctx.role} />}
        topbar={
          <TopBar
            activeClinicId={ctx.scope.clinicId}
            role={ctx.role}
            userName={ctx.user.name}
            userEmail={ctx.user.email}
          />
        }
        bottomNavigation={<BottomNav role={ctx.role} />}
        overlays={
          <>
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
            <DesktopOfflineBridge
              userId={ctx.user.id}
              email={ctx.user.email}
              displayName={ctx.user.name}
              clinicId={ctx.scope.clinicId}
              clinicName={clinicName}
              role={ctx.role}
            />
          </>
        }
      >
        {children}
      </AppShellFrame>
    </ConnectivityStatusProvider>
  )
}
