// GitHub issue #60 / Faz 10, Prompt 10.2 — landing sayfasının TÜM metni ve
// sayısal iddiaları TEK dosyada. Gerekçe: bir pazarlama sayfasında değişen
// şey neredeyse her zaman METİNdir, düzen değil; kopyayı JSX'in içine
// serpiştirmek her düzeltmeyi bir bileşen düzenlemesine çeviriyor.
//
// DÜRÜSTLÜK KURALI (bu dosyayı düzenleyen herkes için): buradaki HER SAYI
// gerçek bir kaynaktan gelir ve aşağıda o kaynağın nasıl yeniden
// ÜRETİLECEĞİ yazılıdır. Doğrulanamayan hiçbir sayı bu dosyaya girmez.

export const SITE_NAME = 'Öğün'

// Yol haritasının konumlandırması (bkz. faz-10-ui-cilasi.md, Prompt 10.2
// BAĞLAM bloğu): "Ana iddia: 15 dakika değil 90 saniye + anlık mikro besin
// öğesi yeterliliği." Bu, ürün sahibinin kendi hedef iddiası — burada
// AYNEN korunuyor, abartılmıyor.
export const HERO = {
  eyebrow: 'Klinik diyetisyenler için masaüstü uygulaması',
  headline: 'Diyet listesi 15 dakikada değil, 90 saniyede.',
  subhead:
    'Öğün, serbest metin kutusu değil gerçek bir besin bileşim motorudur. Siz listeyi yazarken enerji, makro ve mikro besin öğesi yeterliliği anında hesaplanır — planı danışana vermeden önce eksiği görürsünüz.',
  primaryCta: 'Uygulamayı indir',
  secondaryCta: 'Hesap oluştur',
  // İkincil eylemin altındaki açıklama — 14 günlük deneme GERÇEKTEN var
  // (bkz. apps/web/src/lib/subscription/plans.ts TRIAL_PLAN_LIMITS ve
  // packages/db/src/queries/clinics.ts createDraftClinic → trialEndsAt),
  // kart bilgisi istenmiyor.
  secondaryCtaNote: '14 gün ücretsiz, kart bilgisi istemiyoruz.',
} as const

// ÜÇ DEĞER BÖLÜMÜ (GÖREV 1): (1) besin bileşim motoru, (2) hız,
// (3) KVKK / yerli barındırma.
export interface ValueSection {
  id: string
  kicker: string
  title: string
  body: string
  points: string[]
}

export const VALUE_SECTIONS: ValueSection[] = [
  {
    id: 'bilesim-motoru',
    kicker: 'Fark burada',
    title: 'Besin bileşim motoru — serbest metin kutusu değil',
    body: 'Türkiye ve KKTC pazarındaki diyetisyen yazılımlarının çoğu bir CRM: randevu, ödeme, danışan kartı. Diyet listesi ise düz bir metin kutusudur — ne kadar enerji verdiğinizi, demir yeterli mi, sistem bilmez. Öğün’de her kalem gerçek bir besin kaydına bağlanır.',
    points: [
      'Her besin kalemi miktar ve porsiyonla birlikte gerçek bileşim verisine bağlanır',
      '60 besin öğesi (enerji, makrolar, vitaminler, mineraller) kalem kalem hesaplanır',
      'Değişim (mübadele) listesi ve gram bazlı çalışma aynı editörde',
      'Alerjen çakışması ve eksik veri uyarıları planı kapatmadan önce görünür',
    ],
  },
  {
    id: 'hiz',
    kicker: 'Hız',
    title: 'Panel siz yazarken hesaplar, siz beklemezsiniz',
    body: 'Besin öğesi paneli her tuş vuruşunda yeniden hesaplanır. Hedef, ölçülen bir performans bütçesidir: panel güncellemesi p95 < 50 ms, besin araması p95 < 20 ms. Bunlar tahmin değil — depodaki benchmark script’leriyle ölçülür ve docs/performance.md’ye yazılır.',
    points: [
      'Yerel besin indeksi: arama sonuçları sunucuya gitmeden, yazarken gelir',
      'Kaydetme otomatik; “kaydet”e basmayı unutmak diye bir şey yok',
      'Öğün blokları ve kalemler sürükle-bırak ile yeniden sıralanır',
      'Şablondan plan üretme: sık kullandığınız listeler bir tıkla yeni danışana',
    ],
  },
  {
    id: 'kvkk',
    kicker: 'Veri sorumluluğu',
    title: 'KVKK’ya göre kurgulanmış, barındırma yeri sizin kararınız',
    body: 'Danışan kayıtları özel nitelikli kişisel veridir. Öğün’ün veri modeli klinik bazlı izole edilmiştir ve her erişim denetim kaydına yazılır. Uygulama, kendi sunucunuzda (Docker) veya AB bölgesinde barındırılabilir — bir SaaS panosuna kilitlenmezsiniz.',
    points: [
      'Klinik bazlı izolasyon: bir kliniğin verisi bir diğerinden sorgu seviyesinde ayrıdır',
      'Denetim kaydı: kim, ne zaman, hangi danışan kaydına dokundu',
      'Veri sahibi hakları (erişim, silme, taşınabilirlik) için hazır dışa aktarım',
      'Docker ile kendi sunucunuzda çalıştırma seçeneği — depo açık kurulum dokümanıyla gelir',
    ],
  },
]

// KAYNAK ŞEFFAFLIĞI (GÖREV 1) — "rakiplerin veremediği güveni verir".
//
// SAYILARIN KAYNAĞI: bu satırlar packages/etl importer'larının GERÇEKTEN
// yazdığı verilerden okundu. Yeniden üretmek için (içe aktarım yapılmış bir
// veritabanına karşı):
//   select ds.code, count(*) from foods f
//     join data_sources ds on ds.id = f.source_id group by 1;
//   select count(*) from nutrients;
// Atıf ve lisans metinleri UYDURULMADI — packages/etl/src/importers/bls.ts
// (BLS_CITATION) ve usda.ts (USDA_CITATION / USDA_LICENSE) içindeki
// sabitlerin BİREBİR aynısı; importer bu değerleri data_sources tablosuna
// da yazar.
export interface DataSourceCard {
  code: string
  name: string
  scope: string
  foodCount: number
  citation: string
  license: string
  licenseUrl: string | null
  homepageUrl: string
}

export const DATA_SOURCES: DataSourceCard[] = [
  {
    code: 'BLS 4.0',
    name: 'Bundeslebensmittelschlüssel',
    scope: 'Almanya ulusal besin bileşim veri tabanı — Max Rubner-Institut',
    foodCount: 7140,
    citation:
      'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe. DOI: 10.25826/Data20251217-134202-0',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/deed.tr',
    homepageUrl: 'https://www.blsdb.de/',
  },
  {
    code: 'USDA FDC',
    name: 'FoodData Central — Foundation Foods + SR Legacy',
    scope: 'ABD Tarım Bakanlığı, Tarımsal Araştırma Servisi',
    foodCount: 8262,
    citation:
      'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, fdc.nal.usda.gov.',
    license: 'Public Domain (U.S. Government Work)',
    licenseUrl: null,
    homepageUrl: 'https://fdc.nal.usda.gov/',
  },
]

export const TOTAL_FOOD_COUNT = DATA_SOURCES.reduce((sum, source) => sum + source.foodCount, 0)
export const NUTRIENT_FIELD_COUNT = 60

// Kaynak şeffaflığı bölümünün ALTINDAKİ dürüstlük notları. Bunlar bir
// pazarlama sayfasında alışılmadık ama BİLİNÇLİ: yol haritasının açık
// kalemleri (TÜRKOMP izni, BeBiS karşılaştırması, besin adı çevirisi) burada
// gizlenmiyor. Bir klinik diyetisyen bunları zaten ilk hafta fark eder;
// önceden söylemek güven kazandırır, sonradan bulunması güveni kaybettirir.
export const SOURCE_CAVEATS: string[] = [
  'TürKomp (Türkiye Gıda Kompozisyon Veri Tabanı) için kullanım izni süreci devam ediyor; alındığında Türkiye’ye özgü besinler aynı motora eklenecek.',
  'Besin adlarının Türkçeleştirilmesi ve besin öğesi eşleme tablolarının klinik denetimi pilot süresince yürüyor — bu yüzden pilot, açık fiyatlı bir satıştan önce geliyor.',
  'Kaynaklar arasında çakışan değerlerde öncelik sırası koda gömülüdür ve her besin kaydında hangi kaynaktan geldiği görünür.',
]

// SSS (GÖREV 1). Cevaplar ürünün GERÇEK durumunu anlatır — henüz olmayan
// bir şey "var" gibi yazılmaz.
export interface FaqItem {
  question: string
  answer: string
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Öğün tarayıcıda mı çalışıyor, yoksa program mı kuruyorum?',
    answer:
      'Öğün bir masaüstü uygulamasıdır: Windows ve macOS için kendi penceresi, görev çubuğu simgesi ve sistem bildirimleri olan bir program kurarsınız. Bu web sitesi yalnızca hesap açma, abonelik ve indirme içindir. Klinik verileriniz merkezî sunucuda saklanır, uygulama internet bağlantısı ister.',
  },
  {
    question: 'Verilerim nerede tutuluyor? KVKK açısından durum ne?',
    answer:
      'Danışan verileri merkezî veritabanında, klinik bazlı izole edilmiş şekilde tutulur; her erişim denetim kaydına yazılır. Barındırma yeri sabit değildir — kendi sunucunuzda Docker ile ya da AB bölgesinde çalıştırılabilir. KVKK aydınlatma ve açık rıza metinleri pilot öncesi yayımlanacak; hazır olmadan “tamamdır” demiyoruz.',
  },
  {
    question: 'Besin verileri nereden geliyor, güvenilir mi?',
    answer:
      'BLS 4.0 (Max Rubner-Institut, CC BY 4.0) ve USDA FoodData Central (Foundation Foods + SR Legacy, kamu malı) veri tabanlarından. Her besin kaydında hangi kaynaktan geldiği ve değerin ölçüm mü tahmin mi olduğu saklanır. Atıf ve lisans bilgisi bu sayfada açıkça yazılıdır.',
  },
  {
    question: 'Mevcut danışanlarımı aktarabilir miyim?',
    answer:
      'Evet. Danışan listesi CSV içe aktarma ile taşınır; kurulum sihirbazı ilk açılışta klinik bilgilerinizi ve çalışma saatlerinizi sorar. Rakip yazılımlardan otomatik göç aracı yok — dosyayı dışa aktarıp içe aktarmanız gerekir.',
  },
  {
    question: 'Danışanım için mobil uygulama var mı?',
    answer:
      'Hayır, danışan için ayrı bir uygulama yok. Plan, süresi dolan bir paylaşım bağlantısıyla gönderilir; danışan telefonunda tarayıcıdan açar, uygulama kurmasına gerek kalmaz. PDF çıktısı da alınabilir.',
  },
  {
    question: 'Fiyat ne kadar?',
    answer:
      'Pilot dönemde fiyat listesi yayımlanmıyor. Üç paketin kapsamı bu sayfada açık; fiyatlandırma pilot diyetisyenlerle birlikte belirleniyor. Formu doldurun, kapsam ve koşulları birlikte konuşalım.',
  },
]

// GÖREV 2 — plan kartları. Kapsam/limit değerleri UYDURULMADI:
// apps/web/src/lib/subscription/plans.ts içindeki PLAN_DEFINITIONS'tan
// okunur (bkz. pricing.tsx), burada sadece pazarlama tarafındaki ek satırlar
// tutulur.
export const PLAN_MARKETING_FEATURES: Record<string, string[]> = {
  başlangıç: [
    'Plan editörü ve besin bileşim motorunun tamamı',
    'Randevu takvimi ve danışan dosyası',
    'Plan paylaşım bağlantısı ve PDF çıktısı',
  ],
  klinik: [
    'Başlangıç’taki her şey',
    'Ekip üyeleri ve rol bazlı yetkilendirme',
    'Klinik geneli finans ve paket takibi',
  ],
  kurumsal: [
    'Klinik’teki her şey',
    'Sınırsız danışan ve kullanıcı',
    'Kendi sunucunuzda (Docker) kurulum desteği',
  ],
}

export const PRICING = {
  badge: 'Pilot fiyatlandırması',
  title: 'Fiyat listesi pilot sonrasında',
  body: 'Öğün şu anda pilot aşamasında. Fiyatı, ürünü gerçek klinik akışında kullanan diyetisyenlerle birlikte belirliyoruz — bu yüzden burada bir rakam yok. Paketlerin kapsamı ise bugünden net.',
} as const
