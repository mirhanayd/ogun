export const SITE_NAME = 'Öğün'

export const HERO = {
  eyebrow: 'Diyetisyen klinikleri için çalışma alanı',
  headline: 'Diyet listesi 15 dakikada değil, 90 saniyede.',
  subhead:
    'Danışan takibinden beslenme planına kadar kliniğinizin bütün akışı tek yerde. Siz planı yazarken Öğün enerji, makro ve mikro besin öğelerini anında hesaplar; ekip aynı güncel kayıt üzerinden çalışır.',
  primaryCta: 'Klinik yönetici hesabı oluştur',
  secondaryCta: 'Ürünü yakından görün',
} as const

export interface ValueSection {
  id: string
  number: string
  kicker: string
  title: string
  body: string
  points: string[]
}

export const VALUE_SECTIONS: ValueSection[] = [
  {
    id: 'bilesim-motoru',
    number: '01',
    kicker: 'Planlama motoru',
    title: 'Metin kutusu değil, hesap yapan klinik araç',
    body: 'Öğün’de her besin kalemi; miktarı, porsiyonu ve kaynağıyla gerçek bir besin kaydına bağlanır. Böylece plan yalnızca okunabilir değil, klinik olarak değerlendirilebilir bir çıktıya dönüşür.',
    points: [
      'Enerji, makro, vitamin ve mineraller siz yazarken yeniden hesaplanır',
      'Gram ve değişim listesi yaklaşımı aynı plan içinde birlikte çalışır',
      'Eksik veri ve alerjen uyarıları plan danışana ulaşmadan görünür',
      'Sık kullandığınız planları şablona dönüştürüp yeniden kullanabilirsiniz',
    ],
  },
  {
    id: 'klinik-akisi',
    number: '02',
    kicker: 'Klinik operasyonu',
    title: 'Danışan, randevu ve plan arasında sekme kaybetmeyin',
    body: 'Danışanın geçmişi, görüşmeleri, belgeleri ve beslenme planları aynı klinik kaydında buluşur. Günün akışı sadeleşir; ekip, en son bilginin nerede olduğunu aramak zorunda kalmaz.',
    points: [
      'Danışan dosyası, randevu takvimi ve plan geçmişi tek çalışma alanında',
      'Otomatik kaydetme ile yarım kalan plan aynı yerden devam eder',
      'PDF veya güvenli bağlantı ile danışana ulaştırmaya hazır çıktı',
      'Hızlı arama ve klavye akışlarıyla yoğun klinik günlerine uygun kullanım',
    ],
  },
  {
    id: 'ekip-ve-guven',
    number: '03',
    kicker: 'Ekip ve veri sorumluluğu',
    title: 'Yönetici bütünü görür, diyetisyen kendi danışanına odaklanır',
    body: 'Klinik yönetici hesabı kurumun çalışma alanını kurar ve diyetisyenleri davet eder. Yetkiler role göre sınırlandırılır; danışan verisine erişim klinik sınırları içinde izlenebilir kalır.',
    points: [
      'Yönetici, kliniğin danışanlarını ve ekip yapısını tek yerden yönetir',
      'Davet edilen diyetisyen yalnızca kendisine atanan danışanları görür',
      'Klinik bazlı veri izolasyonu ve erişim denetim kayıtları',
      'Web, Windows ve macOS üzerinde aynı güncel klinik çalışma alanı',
    ],
  },
]

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

export const SOURCE_CAVEATS: string[] = [
  'TürKomp (Türkiye Gıda Kompozisyon Veri Tabanı) için kullanım izni süreci devam ediyor; izin alındığında Türkiye’ye özgü besinler aynı motora eklenecek.',
  '15.402 besin adının Türkçeleştirmesi tamamlandı. Klinik terminoloji ve besin öğesi eşlemeleri diyetisyen değerlendirmesine açık tutuluyor.',
  'Kaynaklar arasında çakışan değerlerde öncelik sırası koda gömülüdür; her besin kaydında hangi kaynaktan geldiği görünür.',
]

export interface FaqItem {
  question: string
  answer: string
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Öğün tarayıcıda mı çalışıyor, program mı kuruyorum?',
    answer:
      'İkisi de. Kliniğinizin aynı çalışma alanına web tarayıcısından erişebilir veya Windows ve macOS masaüstü uygulamasını kullanabilirsiniz. Danışanlarınız ise kendilerine gönderilen planı telefonlarında, uygulama kurmadan açar.',
  },
  {
    question: 'İlk hesabı kim oluşturmalı?',
    answer:
      'Klinik sahibi veya kurum yöneticisi ilk hesabı oluşturur ve klinik çalışma alanını kurar. Ardından ekipteki diyetisyenleri e-posta ile davet eder; her diyetisyen kendi şifresini güvenli davet bağlantısından belirler.',
  },
  {
    question: 'Diyetisyenler bütün danışanları görebilir mi?',
    answer:
      'Hayır. Klinik yöneticisi kurumun tüm danışanlarını ve ekip yapısını yönetebilir. Yönetici olmayan diyetisyenler yalnızca kendilerine atanan danışanları listeler ve onların klinik akışında çalışır.',
  },
  {
    question: 'Besin verileri nereden geliyor?',
    answer:
      'BLS 4.0 ve USDA FoodData Central veri tabanlarından. Her besin kaydında kaynak bilgisi korunur; atıf, lisans ve kapsam ayrıntılarını bu sayfadaki Kaynaklar bölümünde açıkça görebilirsiniz.',
  },
  {
    question: 'Mevcut danışanlarımı aktarabilir miyim?',
    answer:
      'Evet. Danışan listenizi CSV ile içe aktarabilirsiniz. Kurulum sırasında klinik bilgilerinizi tanımladıktan sonra ekibinizi davet edip mevcut çalışma düzeninizi adım adım Öğün’e taşıyabilirsiniz.',
  },
  {
    question: 'Danışan planı nasıl alır?',
    answer:
      'Planı PDF olarak indirebilir, e-posta ile gönderebilir veya süresi dolan güvenli bir paylaşım bağlantısı oluşturabilirsiniz. Danışanın ayrı bir hesap ya da uygulama kurması gerekmez.',
  },
]
