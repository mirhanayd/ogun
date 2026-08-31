// GitHub issue #54 / Prompt 9.4, GÖREV 4 — `/indir` sayfasının (bkz.
// apps/web/src/app/indir/page.tsx) okuduğu masaüstü sürüm verisi.
//
// NEDEN STATİK/ELLE GÜNCELLENEN BİR DOSYA — GERÇEK ZAMANLI R2 MANİFEST
// FETCH DEĞİL: `/indir` (apps/web, Next.js) ile `tauri-plugin-updater`nin
// (apps/desktop, bkz. src-tauri/src/updater.rs) güncelleme manifesti FARKLI
// TÜKETİCİLERdir — aynı JSON şemasını paylaşmak ZORUNDA değiller. R2
// kovası + gerçek sürümler bu sandbox'ta henüz YOK (bkz. docs/
// desktop-deployment.md "Credential-pending" notu); bu yüzden veri şimdilik
// buraya ELLE eklenir (her `desktop-v*` release'inde bir satır). R2 manifest
// canlı olduğunda bu dosya bir sunucu bileşeninde `fetch(process.env.
// OGUN_UPDATE_MANIFEST_URL + '/latest.json', { next: { revalidate: 3600 } })`
// ile DEĞİŞTİRİLEBİLİR — bu issue'nun kapsamı DIŞINDA bir gelecek
// iyileştirme.

export type DesktopPlatform = 'windows' | 'macos'

export interface DesktopDownloadAsset {
  platform: DesktopPlatform
  /** Kullanıcıya gösterilen kısa etiket, ör. ".msi (Windows Installer)". */
  label: string
  url: string
  /** First-party redirect kullanıldığında kullanıcıya gösterilecek gerçek asset adı. */
  fileName?: string
  /** Yayınlanan dosyanın bütünlük doğrulaması için küçük harfli SHA-256 özeti. */
  sha256?: string
}

export interface DesktopRelease {
  version: string
  /** ISO 8601 — ör. "2026-08-18". */
  publishedAt: string
  /** Türkçe sürüm notları, madde madde. */
  notes: string[]
  downloads: DesktopDownloadAsset[]
}

export const DESKTOP_RELEASES: DesktopRelease[] = [
  {
    version: '0.3.3',
    publishedAt: '2026-08-31',
    notes: [
      'Kayıtlı cihaz profili her process başlangıcında internet ve cached session durumundan bağımsız olarak PIN ile açılır; native yerel veri guard’ı da PIN kurulmuş profillerde online session’ı unlock saymaz.',
      'Danışan klinik sekmeleri, randevu formu, finans ve ayarlar browser ile aynı presentation component implementation üzerinden yerel şifreli repository’ye bağlanır.',
      'Finans ve ayarlar gerçek offline route/read-model desteğine kavuştu; bilinen navigation route’larında sonsuz placeholder kalmadı.',
      'Desktop command palette artık yerel danışan ve besin indeksinde çalışan arama ile web’deki aynı komut yüzeyini kullanır.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit EXE — önerilen)',
        url: '/api/desktop/download?platform=windows&format=exe&version=0.3.3',
        fileName: 'Ogun_0.3.3_x64-setup.exe',
        sha256: 'cf9858284722f2d810a9e428404db01bd443cde5df71ed0ec3600c421ec07d8a',
      },
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit MSI — alternatif)',
        url: '/api/desktop/download?platform=windows&format=msi&version=0.3.3',
        fileName: 'Ogun_0.3.3_x64_tr-TR.msi',
        sha256: '3040c83999599c1dfd60a8e2e2c49f0843d1b42035a5f33830c4d4794208507b',
      },
      {
        platform: 'macos',
        label: 'macOS 10.15+ (Apple Silicon ve Intel)',
        url: '/api/desktop/download?platform=macos&format=dmg&version=0.3.3',
        fileName: 'Ogun_0.3.3_universal.dmg',
        sha256: '1e4519fce7eabe1f92d849b1d7774bf840e8d9408f8a9127a574ce29148ce278',
      },
    ],
  },
  {
    version: '0.3.2',
    publishedAt: '2026-08-30',
    notes: [
      'Desktop production CSS artık web ile paylaşılan tüm Tailwind kaynaklarını tarar; sidebar, grid, spacing ve responsive utility sınıfları installer içinde eksiksizdir.',
      'Panel, danışanlar, danışan detayı, planlar, plan editörü, randevular ve besin arama ekranları web ve desktop tarafından aynı presentation component implementation üzerinden render edilir.',
      'Şifreli SQLite, PIN cold-start, durable outbox ve reconnect sync korunurken yalnız veri/repository adapter’ları runtime’a göre değişir.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit EXE — önerilen)',
        url: '/api/desktop/download?platform=windows&format=exe&version=0.3.2',
        fileName: 'Ogun_0.3.2_x64-setup.exe',
        sha256: 'b1269cf7a442aa5f25c097db7d2ba5787f9b894097082ae0a8242a8f98d13ebf',
      },
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit MSI — alternatif)',
        url: '/api/desktop/download?platform=windows&format=msi&version=0.3.2',
        fileName: 'Ogun_0.3.2_x64_tr-TR.msi',
        sha256: '42353728ac6dfe7baa8c892455a9493d9cd2a63376043cb3f10e3f7f45193c70',
      },
      {
        platform: 'macos',
        label: 'macOS 10.15+ (Apple Silicon ve Intel)',
        url: '/api/desktop/download?platform=macos&format=dmg&version=0.3.2',
        fileName: 'Ogun_0.3.2_universal.dmg',
        sha256: 'dad2942c064eacf44d0bd3d4d8ed10903d937faf3dea00384491a2b635d910f8',
      },
    ],
  },
  {
    version: '0.3.1',
    publishedAt: '2026-08-30',
    notes: [
      'Çevrimiçi ve çevrimdışı kullanım artık aynı paketlenmiş Öğün arayüzü ve route ağacıyla çalışır.',
      'Danışan, klinik kayıt, plan ve randevu verileri kullanıcı/klinik kapsamlı şifreli SQLite veritabanından okunur.',
      'Offline değişiklikler durable outbox üzerinden idempotent olarak eşitlenir; bağlantı geri geldiğinde ekran veya route değişmez.',
      'Besin kataloğu yerel indeksli SQLite aramasıyla plan editöründe bağlantısız kullanılabilir.',
      'Web indirme düğmesi artık son yayınlanmış GitHub masaüstü sürümünü güvenli biçimde çözüp gerçek installer asset’ine yönlendirir.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit EXE — önerilen)',
        url: '/api/desktop/download?platform=windows&format=exe&version=0.3.1',
        fileName: 'Ogun_0.3.1_x64-setup.exe',
        sha256: 'b40f44f08b1f8c5a636ba0a09d7eebb9975c59c9e41f41394353c06639ee0387',
      },
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit MSI — alternatif)',
        url: '/api/desktop/download?platform=windows&format=msi&version=0.3.1',
        fileName: 'Ogun_0.3.1_x64_tr-TR.msi',
        sha256: '7a8ad689945b3b4feb7a803b018772a0f7c8b759c0e1590a9833363f99d2d036',
      },
      {
        platform: 'macos',
        label: 'macOS 10.15+ (Apple Silicon ve Intel)',
        url: '/api/desktop/download?platform=macos&format=dmg&version=0.3.1',
        fileName: 'Ogun_0.3.1_universal.dmg',
        sha256: '7e77bf4126e17003c7782665475ccb0b9c826a6ae0e00974c435758948fae8d4',
      },
    ],
  },
  {
    version: '0.2.13',
    publishedAt: '2026-08-27',
    notes: [
      'Bağlantı kesildiğinde Edge hata sayfası yerine aynı masaüstü kabuğunda çevrimdışı çalışma alanına geçilir.',
      'Çevrimdışı başlangıçta kayıtlı hesap ve PIN kilidi standart uygulama arayüzünün üzerinde açılır.',
      'Danışan, randevu, tahsilat ve plan değişiklikleri şifreli cihaz kasasında tutulup bağlantı gelince otomatik eşitlenir.',
      'Besin kataloğu cihaza indirilir; çevrimdışıyken besin arama, öğüne ekleme ve yeni plan oluşturma desteklenir.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit EXE — önerilen)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.13/Ogun_0.2.13_x64-setup.exe',
        sha256: 'fbe67611a6edea9c8880487dd256e86473e75d75f0b2f29f37a6b090c94924d5',
      },
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit MSI — alternatif)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.13/Ogun_0.2.13_x64_tr-TR.msi',
        sha256: 'a6ce215ade3477145be11ece7bc3d5396396e30d66df20c9fdff25fa1ba94052',
      },
      {
        platform: 'macos',
        label: 'macOS 10.15+ (Apple Silicon ve Intel)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.13/Ogun_0.2.13_universal.dmg',
        sha256: '430e722856ea2c2faeffb8e79731509875ce2e4f56675041c2250dc5bc382b15',
      },
    ],
  },
  {
    version: '0.2.11',
    publishedAt: '2026-08-26',
    notes: [
      'Çevrimdışı çalışma alanı artık çevrimiçi masaüstü uygulamasıyla aynı başlık çubuğu, kenar menüsü, renkler ve panel kart düzenini kullanır.',
      'Klinik ve kullanıcı kimlik işaretleri kayıtlı cihaz profilinden otomatik oluşturulur.',
      'Şifreli cihaz kasası, hızlı giriş PIN’i ve bağlantı gelince senkronizasyon davranışı korunur.',
      'Windows EXE ve MSI paketleriyle birlikte Apple Silicon ve Intel uyumlu universal macOS paketi yayınlandı.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit EXE — önerilen)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.11/Ogun_0.2.11_x64-setup.exe',
        sha256: 'ba996a4dc0fe1db18a8ddb4bd4af6ccba39757b78ab0a64c792964afb0af6a7f',
      },
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit MSI — alternatif)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.11/Ogun_0.2.11_x64_tr-TR.msi',
        sha256: 'ed2a4ae875f2b514f6a3476e2f75aae1451769ec98f2926940d3063209b13741',
      },
      {
        platform: 'macos',
        label: 'macOS 10.15+ (Apple Silicon ve Intel)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.11/Ogun_0.2.11_universal.dmg',
        sha256: '86f80cb1c2fa9b15a814de58854ab79b529045fb72118cc35fca69e6f82ce951',
      },
    ],
  },
  {
    version: '0.2.10',
    publishedAt: '2026-08-26',
    notes: [
      'Açılıştaki beyaz ekran flaşı ve girişten sonraki arayüz takılması giderildi.',
      'Cihaz profili hazırlanmadan PIN oluşturulamama sorunu çözüldü; hızlı giriş PIN’i ilk denemede kaydedilir.',
      'Başlık çubuğundaki pencere düğmeleri ve çift tıkla büyütme daha güvenilir çalışır.',
      'Üst çubukta arama artık sayfa, ayar, danışan ve besin sonuçlarını tür etiketleriyle ayırıp listeler.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit EXE — önerilen)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.10/Ogun_0.2.10_x64-setup.exe',
        sha256: '844c4c4e6eca22cd1357e4101340e9ae7e2c0fa70da7eee40cb2335a08e768e7',
      },
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit MSI — alternatif)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.10/Ogun_0.2.10_x64_tr-TR.msi',
        sha256: 'fc9384abc46b1cd0a16606712e9ec880526873e2849e1e37e99dc54b4a20044d',
      },
      {
        platform: 'macos',
        label: 'macOS 10.15+ (Apple Silicon ve Intel)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.10/Ogun_0.2.10_universal.dmg',
        sha256: 'a64f512386286a1ffba48f4ee3b699fc60b4dce8cd65304c6fc022cce3f0669a',
      },
    ],
  },
  {
    version: '0.2.5',
    publishedAt: '2026-08-25',
    notes: [
      'Bu cihazda kayıtlı hesap varsa Öğün, Windows oturumu açıldığında arka planda otomatik başlar.',
      'Hafif besin kataloğu hazırlandıktan sonra uygulama penceresi kendiliğinden gösterilir.',
      'Öğün sistem tepsisinde zaten açıksa masaüstü kısayoluna yeniden tıklamak mevcut pencereyi öne getirir.',
      'Başlangıçtaki besin indeksleme işlemleri arayüzü kilitlememesi için küçük partilere bölündü.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit EXE — önerilen)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.5/Ogun_0.2.5_x64-setup.exe',
        sha256: '2c8bf047fe3e852e7fbc6b51a61427dde1d42a6b688c6645624909f18857eb40',
      },
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit MSI — alternatif)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.5/Ogun_0.2.5_x64_tr-TR.msi',
        sha256: '8d01e19463960836dfe12ad92078924917daff076adf0806c3f84b97fddcca0c',
      },
    ],
  },
  {
    version: '0.2.4',
    publishedAt: '2026-08-24',
    notes: [
      'Besin araması ilk açılışta daha hızlı hazır olur; ayrıntılı mikro besin paketi arka planda indirilir.',
      'Plan editöründeki mikro besinler ve uyarılar artık tek, düzenli bir kaydırma alanında gösterilir.',
      'Tarif bileşeni bulunan Türk yemeklerinde alerji ve intolerans uyarıları doğrudan içerikten üretilir.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.4/Ogun_0.2.4_x64-setup.exe',
        sha256: 'dc92c23569e6bf2a8633c078d85fe7f432007aa758133e7a163121ecc42f1e10',
      },
    ],
  },
  {
    version: '0.2.1',
    publishedAt: '2026-08-24',
    notes: [
      'Hızlı giriş PIN’i artık çalışma modu seçmez; bağlantı varsa normal panele yönlendirir.',
      'Çevrimiçi ve çevrimdışı kullanım aynı uygulama düzenini ve gezinme yapısını korur.',
      'Desteklenen danışan, ölçüm, anamnez, plan ve randevu kayıtları bağlantı gelene kadar cihazda tutulur.',
      'E-posta daveti, dosya yükleme ve plan paylaşımı gibi sunucu gerektiren işlemler çevrimdışıyken açıkça pasifleştirilir.',
      'Plan editöründe enerjiyle birlikte mikro besin öğeleri canlı takip edilebilir.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.1/Ogun_0.2.1_x64-setup.exe',
        sha256: 'cfa26a632d04a10db147f802767795aa9d62f9d6eac8265f2eb516fa6109fa07',
      },
    ],
  },
  {
    version: '0.2.0',
    publishedAt: '2026-08-23',
    notes: [
      'Kayıtlı cihaz hesabı hızlı giriş PIN’iyle açılabilir; çalışma modu bağlantı durumuna göre belirlenir.',
      'Danışan, plan ve randevu kayıtları şifreli cihaz kasasında kalıcı olarak bekler.',
      'Bağlantı geri geldiğinde bekleyen değişiklikler otomatik olarak bulutla eşitlenir.',
      'Plan editörü taslakları uygulama kapatılsa bile kaybolmaz.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.0/Ogun_0.2.0_x64-setup.exe',
      },
      {
        platform: 'macos',
        label: 'macOS 10.15+ (Apple Silicon ve Intel)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.2.0/Ogun_0.2.0_universal.dmg',
      },
    ],
  },
  {
    version: '0.1.9',
    publishedAt: '2026-08-23',
    notes: [
      'Web ve masaüstü uygulaması aynı klinik hesabıyla çalışır.',
      'Google oturum aktarımı ve kalıcı oturum akışı iyileştirildi.',
      'Masaüstü uygulaması kapandığında yerel sunucu artık arkada kalmaz.',
      'Windows pencere başlığı, taşıma ve pencere kontrolleri yenilendi.',
    ],
    downloads: [
      {
        platform: 'windows',
        label: 'Windows 10/11 (64-bit)',
        url: 'https://github.com/mirhanayd/ogun/releases/download/desktop-v0.1.9/Ogun_0.1.9_x64-setup.exe',
      },
    ],
  },
]

export function getLatestDesktopRelease(): DesktopRelease | null {
  return DESKTOP_RELEASES[0] ?? null
}

export const DESKTOP_PLATFORM_LABELS: Record<DesktopPlatform, string> = {
  windows: 'Windows',
  macos: 'macOS',
}

export const DESKTOP_SYSTEM_REQUIREMENTS: Record<DesktopPlatform, string[]> = {
  windows: [
    'Windows 10 (64-bit) veya üzeri',
    'WebView2 Runtime (çoğu güncel Windows kurulumunda zaten yüklüdür; yoksa kurulum sırasında otomatik istenir)',
  ],
  macos: [
    // bkz. src-tauri/tauri.conf.json bundle.macOS.minimumSystemVersion
    'macOS 10.15 (Catalina) veya üzeri',
    'Apple Silicon (M serisi) ve Intel işlemcilerin İKİSİNDE de çalışan TEK bir evrensel (universal) kurulum dosyası',
  ],
}

export const DESKTOP_INSTALL_STEPS: Record<DesktopPlatform, string[]> = {
  windows: [
    '.msi ya da .exe dosyasını indirin — ikisi de aynı uygulamayı kurar; .msi kurumsal/toplu dağıtım için, .exe (NSIS) çoğu kullanıcı için daha hızlı ve daha küçüktür.',
    'İndirilen dosyayı çalıştırın ve kurulum sihirbazını izleyin.',
    'Kurulum tamamlandığında uygulama Başlat menüsünde "Öğün" olarak görünür.',
  ],
  macos: [
    '.dmg dosyasını indirin ve açın.',
    'Açılan pencerede Öğün simgesini "Applications" (Uygulamalar) klasörüne sürükleyin.',
    'İlk açılışta macOS Gatekeeper "doğrulanamayan geliştirici" uyarısı gösterebilir — sağ tık > Aç ile devam edilebilir; Apple Developer imzalama/notarization tamamlandığında (bkz. docs/desktop-deployment.md) bu uyarı kalkacaktır.',
  ],
}
