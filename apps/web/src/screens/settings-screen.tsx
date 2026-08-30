import { ArrowRight, Clock3, MessageSquareText, Settings2, Share2, ShieldCheck, UsersRound, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { NavigationLink } from '@/components/navigation-link'
import { WEEKDAYS_TR } from '@/lib/onboarding'
import type { ClinicIdentityFormValues } from '@/lib/validation/clinic-identity-schemas'
import { ClinicIdentityEditor, type ClinicIdentity } from '@/app/(app)/ayarlar/clinic-identity-editor'
import { DesktopSettingsCard } from '@/app/(app)/ayarlar/desktop-settings-card'

export interface WorkingHourView { dayOfWeek: number; isOpen: boolean; startTime: string; endTime: string }
export interface SettingsUserView { userId: string; email: string; displayName: string; clinicId: string; clinicName: string; role: 'owner' | 'dietitian' | 'assistant' }

export function SettingsScreen({ identity, workingHours, user, onSaveIdentity }: { identity: ClinicIdentity; workingHours: WorkingHourView[]; user: SettingsUserView; onSaveIdentity: (values: ClinicIdentityFormValues) => Promise<{ success: boolean; error?: string; identity?: ClinicIdentity }> }) {
  const hours = new Map(workingHours.map((row) => [row.dayOfWeek, row]))
  return <div className="flex flex-col gap-6 pb-8" data-settings-screen>
    <header className="border-b border-border/70 pb-6"><div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-primary uppercase"><Settings2 className="size-3.5" />Klinik çalışma alanı</div><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Ayarlar</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Kliniğinizin kimliğini, çalışma düzenini ve ekip erişimlerini tek yerden yönetin.</p></header>
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]"><div className="grid content-start gap-4"><ClinicIdentityEditor identity={identity} canEdit={user.role === 'owner'} onSave={onSaveIdentity} /><Card><CardHeader className="border-b"><div className="flex gap-3"><Clock3 className="size-5 text-primary" /><div><CardTitle>Çalışma saatleri</CardTitle><CardDescription>Randevu uygunluğu için kullanılan haftalık düzen</CardDescription></div></div></CardHeader><CardContent className="p-0">{WEEKDAYS_TR.map((day, index) => { const hour = hours.get(day.value); return <div key={day.value}>{index > 0 ? <Separator /> : null}<div className="flex items-center justify-between px-5 py-3.5 text-sm"><span className="font-medium">{day.label}</span>{hour?.isOpen ? <span className="rounded-lg bg-muted/55 px-2.5 py-1 text-xs">{hour.startTime.slice(0, 5)} — {hour.endTime.slice(0, 5)}</span> : <Badge variant="secondary">Kapalı</Badge>}</div></div> })}</CardContent></Card></div><div className="grid content-start gap-3">{user.role === 'owner' ? <><SettingsLink icon={UsersRound} title="Ekip ve yetkiler" description="Diyetisyen davetlerini gönderin ve kurum erişimlerini görüntüleyin." href="/ayarlar/ekip" /><SettingsLink icon={MessageSquareText} title="Randevu hatırlatmaları" description="SMS metnini düzenleyin ve gönderim akışını kontrol edin." href="/ayarlar/hatirlatmalar" /><SettingsLink icon={Share2} title="Plan paylaşımı" description="WhatsApp üzerinden gönderilen plan mesajını kişiselleştirin." href="/ayarlar/paylasim" /><SettingsLink icon={ShieldCheck} title="Veri güvenliği ve KVKK" description="Erişim kayıtlarını ve veri saklama politikasını yönetin." href="/ayarlar/veri-guvenligi" /></> : null}<DesktopSettingsCard userId={user.userId} email={user.email} displayName={user.displayName} clinicId={user.clinicId} clinicName={user.clinicName} role={user.role} /></div></section>
  </div>
}

function SettingsLink({ icon: Icon, title, description, href }: { icon: LucideIcon; title: string; description: string; href: string }) {
  return <NavigationLink href={href} className="group rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"><Card className="h-full border-border/70 bg-card/90 py-0 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-11 place-items-center rounded-2xl bg-primary/9 text-primary"><Icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block font-medium">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span><ArrowRight className="size-4 text-muted-foreground" /></CardContent></Card></NavigationLink>
}
