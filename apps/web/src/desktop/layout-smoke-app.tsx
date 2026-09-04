import { useCallback, useState } from 'react'
import { AppShellFrame } from '@/components/app-shell-frame'
import {
  BottomNavView,
  DesktopTitlebarView,
  SidebarNavView,
  TopBarView,
} from '@/components/app-shell-views'
import { NavigationProvider } from '@/components/navigation-link'
import { CommandPaletteView } from '@/app/(app)/_components/command-palette'
import {
  AnamnesisForm,
  type ClientHealthRow,
} from '@/app/(app)/danisanlar/[id]/anamnez/anamnesis-form'
import { ClientsScreen } from '@/screens/clients-screen'
import { ClientsTableView } from '@/screens/clients-table-view'
import { PanelScreen, type PanelFeed } from '@/screens/panel-screen'
import { PlansScreen, type PlanScreenRow } from '@/screens/plans-screen'
import { SettingsScreen } from '@/screens/settings-screen'
import { getClinicBrandingVariables } from '@/lib/clinic-branding'

const RELEASE_SMOKE_ROUTES = new Set([
  'panel',
  'danisanlar',
  'planlar',
  'anamnesis',
  'disease-search',
  'medication-search',
  'settings-logo',
  'settings-color',
  'settings-restart',
  'clients',
  'assignment',
  'search',
])

export function isDesktopLayoutSmokeRoute(value: string): boolean {
  return RELEASE_SMOKE_ROUTES.has(value)
}

const clinicLogoUrl = '/brand/ogun-uygulama-ikonu.svg'
const clinicPrimaryColor = '#6D4AFF'

const clientRows = [
  {
    id: 'client-1',
    firstName: 'Deniz',
    lastName: 'Yılmaz',
    birthDate: '1992-04-12',
    status: 'aktif' as const,
    assignedDietitianId: 'user-1',
    assignedDietitianName: 'Dyt. Ada Demir',
    lastMeasurementAt: new Date('2026-08-25T10:00:00+03:00'),
    lastMeasurementWeightKg: '77.20',
    lastAppointmentAt: new Date('2026-08-28T10:00:00+03:00'),
    lastAppointmentStatus: 'geldi' as const,
    createdAt: new Date('2026-08-01'),
  },
  {
    id: 'client-2',
    firstName: 'Selin',
    lastName: 'Kaya',
    birthDate: '1986-09-21',
    status: 'aktif' as const,
    assignedDietitianId: 'user-2',
    assignedDietitianName: 'Dyt. Ece Kaya',
    lastMeasurementAt: new Date('2026-08-22T10:00:00+03:00'),
    lastMeasurementWeightKg: '64.80',
    lastAppointmentAt: new Date('2026-08-27T10:00:00+03:00'),
    lastAppointmentStatus: 'planlandı' as const,
    createdAt: new Date('2026-08-04'),
  },
]

const dietitians = [
  { id: 'user-1', name: 'Dyt. Ada Demir' },
  { id: 'user-2', name: 'Dyt. Ece Kaya' },
]

const planRows: PlanScreenRow[] = [
  {
    id: 'plan-1',
    clientId: 'client-1',
    name: 'Dengeli Beslenme Programı',
    status: 'taslak',
    isTemplate: false,
    endDate: null,
    updatedAt: new Date('2026-08-29'),
    targetKcal: 1800,
  },
  {
    id: 'plan-2',
    clientId: 'client-2',
    name: 'Kontrol Programı',
    status: 'aktif',
    isTemplate: false,
    endDate: new Date('2026-09-07'),
    updatedAt: new Date('2026-08-28'),
    targetKcal: 1650,
  },
]

const feed: PanelFeed = {
  todayAppointmentsCount: 3,
  noShowCount: 1,
  staleMeasurementCount: 2,
  expiringPackageCount: 0,
  staleMeasurementClients: [],
  expiringPackages: [],
  canManageFinance: true,
  upcomingAppointments: [],
}

const healthRecord = {
  healthRecord: {
    id: 'health-1',
    clientId: 'client-1',
    conditions: ['Diyabet', 'Migren'],
    medications: ['PAROL 500 MG TABLET', 'Omega 3'],
    allergies: [],
    intolerances: [],
    surgeries: null,
    familyHistory: 'Anne tarafında tip 2 diyabet öyküsü.',
    smokingStatus: 'Kullanmıyor',
    alcoholUse: 'Kullanmıyor',
    mealsPerDay: 3,
    eatingOutFrequency: 'Haftada 1',
    waterIntakeMl: 2200,
    activityLevel: 'moderate',
    activityNotes: 'Haftada üç gün yürüyüş.',
    sleepHours: 7,
    sleepQuality: 'İyi',
    bowelHabits: 'Düzenli',
    createdAt: new Date('2026-08-20'),
    updatedAt: new Date('2026-09-04'),
  },
  legacyConditions: ['Migren'],
  legacyMedications: ['Omega 3'],
  conditionSelections: [
    {
      id: 'client-condition-1',
      conditionId: 'condition-diabetes',
      status: 'active',
      diagnosedAt: null,
      note: null,
      nameTr: 'Diyabet',
      nameEn: 'Diabetes mellitus',
      sourceCode: 'ICD10:E14',
      isNeoplasm: false,
      needsReview: false,
    },
  ],
  medicationSelections: [
    {
      id: 'client-medication-1',
      medicationProductId: 'product-parol',
      medicationSubstanceId: null,
      customName: null,
      dose: null,
      doseUnit: null,
      frequency: null,
      route: null,
      startedAt: null,
      endedAt: null,
      isActive: true,
      note: null,
      productName: 'PAROL 500 MG TABLET',
      productBarcode: '8699546010011',
      productSubstanceNames: ['Parasetamol'],
      substanceName: null,
      substanceNeedsReview: null,
    },
  ],
} as unknown as ClientHealthRow

async function searchConditions(query: string) {
  if (!query.toLocaleLowerCase('tr-TR').includes('diy')) return []
  return [
    {
      id: 'condition-diabetes-type-2',
      sourceCode: 'ICD10:E11',
      nameTr: 'Tip 2 Diyabet',
      nameEn: 'Type 2 diabetes mellitus',
      isNeoplasm: false,
      isUiReady: true,
      needsReview: false,
      translationStatus: 'reviewed' as const,
      matchedAlias: 'Tip 2 Diyabet',
    },
  ]
}

async function searchMedicationProducts(query: string) {
  if (!query.toLocaleLowerCase('tr-TR').includes('parol')) return []
  return [
    {
      id: 'product-parol-500',
      name: 'PAROL 500 MG TABLET',
      barcode: '8699546010011',
      activeIngredientRaw: 'PARASETAMOL',
      atcCode: 'N02BE01',
      atcName: 'Paracetamol',
      companyName: 'Atabay',
      prescriptionType: 'Beyaz',
      productType: 'Beşeri tıbbi ürün',
      erxStatus: 'Aktif',
      isSelectable: true,
      substances: [
        {
          id: 'substance-paracetamol',
          nameTr: 'Parasetamol',
          isCombination: false,
          needsReview: false,
        },
      ],
    },
  ]
}

async function searchMedicationSubstances(query: string) {
  if (!query.toLocaleLowerCase('tr-TR').includes('metfor')) return []
  return [
    {
      id: 'substance-metformin',
      nameTr: 'Metformin',
      isCombination: false,
      needsReview: false,
    },
  ]
}

function AnamnesisSmoke() {
  return (
    <section
      data-smoke-anamnesis
      className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm"
    >
      <header className="mb-6 border-b border-border/70 pb-4">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Deniz Yılmaz
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Anamnez</h1>
      </header>
      <AnamnesisForm
        healthRecord={healthRecord}
        onSave={async () => ({ success: true })}
        onSearchConditions={searchConditions}
        onSearchMedicationProducts={searchMedicationProducts}
        onSearchMedicationSubstances={searchMedicationSubstances}
      />
    </section>
  )
}

function ClientsSmoke() {
  return (
    <ClientsScreen role="owner">
      <ClientsTableView
        result={{ rows: clientRows, total: clientRows.length, page: 1, pageSize: 20 }}
        dietitians={dietitians}
        role="owner"
        filters={{ search: '', status: '', assignedDietitianId: '' }}
        onNavigate={() => undefined}
        onArchive={async () => ({ success: true })}
        onAssign={async () => ({ success: true })}
      />
    </ClientsScreen>
  )
}

function SettingsSmoke() {
  return (
    <SettingsScreen
      identity={{
        name: 'Deştiş Kliniği',
        logoUrl: clinicLogoUrl,
        primaryColor: clinicPrimaryColor,
        phone: '+90 212 555 01 23',
        address: 'Teşvikiye, İstanbul',
        taxId: '1234567890',
      }}
      workingHours={[]}
      user={{
        userId: 'user-1',
        email: 'ada@destis-klinik.test',
        displayName: 'Dyt. Ada Demir',
        clinicId: 'smoke-clinic',
        clinicName: 'Deştiş Kliniği',
        role: 'owner',
      }}
      onSaveIdentity={async (values) => ({
        success: true,
        identity: {
          name: values.name,
          logoUrl: values.logoUrl || null,
          primaryColor: values.primaryColor || null,
          phone: values.phone || null,
          address: values.address || null,
          taxId: values.taxId || null,
        },
      })}
    />
  )
}

function screenFor(route: string) {
  if (route === '/danisanlar' || route === '/clients' || route === '/assignment') {
    return <ClientsSmoke />
  }
  if (route === '/planlar') {
    return (
      <PlansScreen
        plans={planRows}
        templates={[]}
        clientNames={{ 'client-1': 'Deniz Yılmaz', 'client-2': 'Selin Kaya' }}
        now={new Date('2026-08-30T10:00:00+03:00')}
      />
    )
  }
  if (route === '/anamnesis') return <AnamnesisSmoke />
  if (route === '/ayarlar') return <SettingsSmoke />
  return <PanelScreen feed={feed} now={new Date('2026-08-30T10:00:00+03:00')} />
}

function routeForScenario(scenario: string): string {
  if (scenario === 'danisanlar' || scenario === 'clients' || scenario === 'assignment') {
    return `/${scenario}`
  }
  if (scenario === 'planlar') return '/planlar'
  if (
    scenario === 'anamnesis' ||
    scenario === 'disease-search' ||
    scenario === 'medication-search'
  ) {
    return '/anamnesis'
  }
  if (scenario.startsWith('settings-')) return '/ayarlar'
  return '/panel'
}

export function DesktopLayoutSmokeApp({ initialRoute }: { initialRoute: string }) {
  const [route, setRoute] = useState(routeForScenario(initialRoute.replace(/^\//, '')))
  const searchClients = useCallback(async (query: string) => {
    const normalized = query.toLocaleLowerCase('tr-TR')
    return clientRows
      .filter((client) =>
        `${client.firstName} ${client.lastName}`
          .toLocaleLowerCase('tr-TR')
          .includes(normalized),
      )
      .map((client) => ({
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: null,
      }))
  }, [])
  const title =
    route === '/danisanlar' || route === '/clients' || route === '/assignment'
      ? 'Danışanlar'
      : route === '/planlar'
        ? 'Planlar'
        : route === '/anamnesis'
          ? 'Anamnez'
          : route === '/ayarlar'
            ? 'Ayarlar'
            : 'Panel'
  const search = (
    <CommandPaletteView role="owner" onNavigate={setRoute} searchClients={searchClients} />
  )

  return (
    <NavigationProvider navigate={setRoute}>
      <AppShellFrame
        clinicName="Deştiş Kliniği"
        clinicLogoUrl={clinicLogoUrl}
        clinicInitials="DK"
        userName="Dyt. Ada Demir"
        brandingStyle={getClinicBrandingVariables(clinicPrimaryColor)}
        desktopTitlebar={
          <DesktopTitlebarView
            maximized={false}
            search={search}
            onMinimize={() => undefined}
            onToggleMaximize={() => undefined}
            onClose={() => undefined}
          />
        }
        navigation={
          <SidebarNavView
            role="owner"
            currentPath={route}
            connectivity="offline"
            onNavigate={setRoute}
          />
        }
        topbar={
          <TopBarView
            pageContext={<span className="font-semibold">{title}</span>}
            clinicSwitcher={<span className="text-sm font-medium">Deştiş Kliniği</span>}
            search={search}
            userMenu={<button type="button">Ada Demir</button>}
          />
        }
        bottomNavigation={
          <BottomNavView role="owner" currentPath={route} onNavigate={setRoute} />
        }
      >
        {screenFor(route)}
      </AppShellFrame>
    </NavigationProvider>
  )
}
