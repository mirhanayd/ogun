import { PilotContactForm } from './pilot-contact-form'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 2 — fiyatlandırma
// bölümünün iletişim formu, kendi bölümü olarak (kartların altında sıkışmış
// bir kutu DEĞİL: pilot başvurusu bu sayfanın dönüşüm hedefi).
//
// ADRES YAPILANDIRILMAMIŞSA: NEXT_PUBLIC_PILOT_CONTACT_EMAIL boşken sahte
// bir e-posta adresi BASMIYORUZ (uydurma bir iletişim adresi, uydurma bir
// ekran görüntüsü kadar zararlı). Adres tanımlıysa formun yanında doğrudan
// yazılabilecek bir mailto bağlantısı da gösterilir — form çalışmazsa
// ziyaretçi çıkmaza girmesin.
export function PilotContact() {
  const contactEmail = process.env.NEXT_PUBLIC_PILOT_CONTACT_EMAIL?.trim()

  return (
    <section id="pilot" aria-labelledby="pilot-baslik" className="border-b border-border/70 bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div>
          <p className="text-helper font-medium tracking-wide text-primary uppercase">Pilot</p>
          <h2 id="pilot-baslik" className="mt-2 text-title text-balance">
            Pilot diyetisyen kontenjanı açık
          </h2>
          <p className="mt-3 text-lead text-muted-foreground">
            Pilotta ürünü gerçek danışan akışınızda kullanırsınız; karşılığında bize eksikleri söylersiniz.
            Fiyatlandırma da bu süreçte, birlikte belirlenir.
          </p>
          {contactEmail ? (
            <p className="mt-4 text-body text-muted-foreground">
              Form yerine doğrudan yazmayı tercih ederseniz:{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="rounded-md text-primary underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {contactEmail}
              </a>
            </p>
          ) : null}
        </div>

        <PilotContactForm />
      </div>
    </section>
  )
}
