import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PLAN_DEFINITIONS } from '@/lib/subscription/plans'
import { PLAN_MARKETING_FEATURES, PRICING } from './content'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 2 — "Üç kart: Başlangıç /
// Klinik / Kurumsal (Prompt 7.3'teki planlarla AYNI). Fiyatları henüz yazma
// — 'Pilot fiyatlandırması' etiketi ve iletişim formu."
//
// "AYNI" burada kelimesi kelimesine uygulandı: paket adları, açıklamaları ve
// limitleri BURADA YENİDEN YAZILMADI — #41'in PLAN_DEFINITIONS'ı
// (apps/web/src/lib/subscription/plans.ts) doğrudan okunuyor. Bu, pazarlama
// sayfasının abonelik ekranıyla (app/(app)/ayarlar/abonelik) SESSİZCE
// ayrışmasını yapısal olarak imkânsız kılıyor: bir limit değişirse iki yüzey
// birlikte değişir. Sayfaya özgü olan TEK şey pazarlama maddeleri
// (content.ts PLAN_MARKETING_FEATURES) — onlar plan tanımına ait değil.
const PLAN_ORDER = ['başlangıç', 'klinik', 'kurumsal'] as const

// Vurgulanan paket: "5 kullanıcıya kadar klinikler" hedef kitlenin ortası.
const HIGHLIGHTED_PLAN = 'klinik'

function formatClientLimit(maxClients: number | null): string {
  return maxClients === null ? 'Sınırsız danışan' : `${maxClients.toLocaleString('tr-TR')} danışana kadar`
}

function formatUserLimit(maxUsers: number, isUnlimited: boolean): string {
  if (isUnlimited) return 'Sınırsız kullanıcı'
  return maxUsers === 1 ? 'Tek kullanıcı' : `${maxUsers} kullanıcıya kadar`
}

export function Pricing() {
  return (
    <section id="fiyatlandirma" aria-labelledby="fiyatlandirma-baslik" className="border-b border-border/70">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-3xl">
          <Badge variant="secondary">{PRICING.badge}</Badge>
          <h2 id="fiyatlandirma-baslik" className="mt-3 text-title text-balance">
            {PRICING.title}
          </h2>
          <p className="mt-3 text-lead text-muted-foreground">{PRICING.body}</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {PLAN_ORDER.map((code) => {
            const plan = PLAN_DEFINITIONS[code]
            const isUnlimited = plan.limits.maxClients === null
            const highlighted = code === HIGHLIGHTED_PLAN
            return (
              <article
                key={code}
                className={
                  highlighted
                    ? 'flex flex-col gap-4 rounded-xl border-2 border-primary bg-card p-6'
                    : 'flex flex-col gap-4 rounded-xl border border-border bg-card p-6'
                }
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-section">{plan.label}</h3>
                  {highlighted && <Badge>En sık seçilen kapsam</Badge>}
                </div>

                <p className="text-body text-muted-foreground">{plan.description}</p>

                <p className="text-data-lg text-primary">{PRICING.badge}</p>

                <ul className="flex flex-col gap-2">
                  {[
                    formatClientLimit(plan.limits.maxClients),
                    formatUserLimit(plan.limits.maxUsers, isUnlimited),
                    `Aylık ${plan.limits.smsQuotaPerMonth.toLocaleString('tr-TR')} SMS hatırlatma`,
                    ...(PLAN_MARKETING_FEATURES[code] ?? []),
                  ].map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-body">{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )
          })}
        </div>

        <p className="mt-4 text-helper text-muted-foreground">
          Üç pakette de besin bileşim motorunun tamamı açıktır — hesaplama gücü pakete göre kısıtlanmaz, yalnızca
          danışan/kullanıcı kapasitesi değişir.
        </p>
      </div>
    </section>
  )
}
