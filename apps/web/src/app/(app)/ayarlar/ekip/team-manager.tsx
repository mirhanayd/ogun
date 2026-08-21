'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Clock3, Mail, MailPlus, ShieldCheck, UserRoundCheck } from 'lucide-react'
import type { ClinicTeamMember, PendingClinicInvitation } from '@ogun/db/queries'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { inviteDietitianAction, revokeClinicInvitationAction } from './actions'

const ROLE_LABELS = {
  owner: 'Yönetici',
  dietitian: 'Diyetisyen',
  assistant: 'Asistan',
} as const

export function TeamManager({
  members,
  invitations,
}: {
  members: ClinicTeamMember[]
  invitations: PendingClinicInvitation[]
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = await inviteDietitianAction({ name, email })
      if (!result.success) {
        setFormError(result.error ?? 'Davet gönderilemedi.')
        return
      }
      setName('')
      setEmail('')
      toast.success('Diyetisyen daveti e-postayla gönderildi.')
    })
  }

  function revoke(invitationId: string) {
    startTransition(async () => {
      const result = await revokeClinicInvitationAction(invitationId)
      if (!result.success) {
        toast.error(result.error ?? 'Davet iptal edilemedi.')
        return
      }
      toast.success('Davet iptal edildi.')
    })
  }

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
      <div className="flex flex-col gap-4">
        <Card className="overflow-hidden border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
          <CardHeader className="border-b border-border/60 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 tracking-tight">
                  <UserRoundCheck className="size-4 text-primary" />
                  Klinik ekibi
                </CardTitle>
                <CardDescription className="mt-1">
                  Yöneticiler tüm danışanları, diyetisyenler yalnızca kendilerine atananları görür.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {members.length} kişi
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto sm:block">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad soyad</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Rol</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="divide-y divide-border/60 sm:hidden">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-5 py-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/8 text-sm font-semibold text-primary ring-1 ring-primary/10">
                    {member.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toLocaleUpperCase('tr-TR')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{member.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </span>
                  <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                    {ROLE_LABELS[member.role]}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {invitations.length > 0 && (
          <Card className="border-border/70 bg-card/90 shadow-sm shadow-foreground/[0.03]">
            <CardHeader className="border-b border-border/60">
              <CardTitle className="flex items-center gap-2 tracking-tight">
                <Clock3 className="size-4 text-primary" />
                Bekleyen davetler
              </CardTitle>
              <CardDescription>
                Süresi dolan bir daveti aynı e-posta adresiyle yeniden gönderebilirsiniz.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 p-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-background/55 p-3.5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <Mail className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invitation.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{invitation.email}</p>
                  </div>
                  <Badge variant={invitation.expired ? 'destructive' : 'outline'}>
                    {invitation.expired ? 'Süresi doldu' : 'Yanıt bekleniyor'}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-lg"
                    disabled={isPending}
                    onClick={() => revoke(invitation.id)}
                  >
                    İptal et
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="h-fit border-primary/20 bg-primary/[0.045] shadow-sm shadow-primary/5 xl:sticky xl:top-4">
        <CardHeader className="border-b border-primary/10">
          <span className="mb-2 grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <MailPlus className="size-5" />
          </span>
          <CardTitle className="tracking-tight">Diyetisyen davet et</CardTitle>
          <CardDescription>
            Diyetisyen, e-postadaki güvenli bağlantıyla kendi şifresini oluşturur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={submitInvitation} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">Ad soyad</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                placeholder="Dyt. Ayşe Yılmaz"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">E-posta</Label>
              <Input
                id="invite-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="ayse@klinik.com"
                required
              />
            </div>
            {formError && (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            )}
            <div className="flex items-start gap-2 rounded-xl border border-primary/10 bg-background/55 p-3 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Davet bağlantısı 7 gün geçerlidir ve yalnızca bir kez kullanılabilir.
            </div>
            <Button
              type="submit"
              className="rounded-xl shadow-sm shadow-primary/15"
              disabled={isPending}
            >
              {isPending ? 'Gönderiliyor…' : 'Daveti gönder'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
