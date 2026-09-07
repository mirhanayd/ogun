'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  ShieldAlert,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Ban,
  Sparkles,
  User,
  Sliders,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import {
  updateReviewerStatusAction,
  updateReviewerCapabilitiesAction,
  toggleReviewerCanPublishAction,
} from '../actions'
import type { ClinicalReviewerCapability, ClinicalReviewerVerificationStatus } from '@ogun/db/queries'

interface ReviewerRow {
  userId: string
  userName: string
  userEmail: string
  professionalRole: string
  specialty: string | null
  verificationStatus: string
  verifiedAt: Date | null
  verifiedBy: string | null
  isActive: boolean
  canPublish: boolean
  createdAt: Date
  capabilities: ClinicalReviewerCapability[]
  activeAssignments: number
  completedReviews: number
}

interface ReviewerTableProps {
  reviewers: ReviewerRow[]
  currentAdminId: string
}

const ROLE_LABELS: Record<string, string> = {
  pharmacist: 'Eczacı',
  dietitian: 'Diyetisyen',
  physician: 'Hekim',
  clinical_admin: 'Klinik Yönetici',
}

const ALL_CAPABILITIES: { key: ClinicalReviewerCapability; label: string }[] = [
  { key: 'medication_food', label: 'İlaç - Besin' },
  { key: 'medication_supplement', label: 'İlaç - Takviye' },
  { key: 'medication_timing', label: 'İlaç - Zamanlama' },
  { key: 'condition_nutrient', label: 'Durum - Besin Öğesi' },
  { key: 'condition_food', label: 'Durum - Besin' },
  { key: 'oncology_medication', label: 'Onkoloji İlaçları' },
  { key: 'renal_nutrition', label: 'Renal Beslenme' },
  { key: 'general_clinical', label: 'Genel Klinik' },
]

export function ReviewerTable({ reviewers, currentAdminId }: ReviewerTableProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Capabilities dialog state
  const [capDialogOpen, setCapDialogOpen] = useState(false)
  const [selectedReviewer, setSelectedReviewer] = useState<ReviewerRow | null>(null)
  const [selectedCaps, setSelectedCaps] = useState<Set<ClinicalReviewerCapability>>(new Set())

  const handleStatusChange = (userId: string, newStatus: ClinicalReviewerVerificationStatus) => {
    startTransition(async () => {
      const res = await updateReviewerStatusAction(userId, newStatus)
      if (res.success) {
        router.refresh()
      }
    })
  }

  const handleTogglePublish = (userId: string, currentVal: boolean) => {
    startTransition(async () => {
      const res = await toggleReviewerCanPublishAction(userId, !currentVal)
      if (res.success) {
        router.refresh()
      }
    })
  }

  const openCapabilitiesDialog = (reviewer: ReviewerRow) => {
    setSelectedReviewer(reviewer)
    setSelectedCaps(new Set(reviewer.capabilities))
    setCapDialogOpen(true)
  }

  const handleSaveCapabilities = () => {
    if (!selectedReviewer) return
    startTransition(async () => {
      const res = await updateReviewerCapabilitiesAction(
        selectedReviewer.userId,
        Array.from(selectedCaps),
      )
      if (res.success) {
        setCapDialogOpen(false)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/80 bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
              <TableHead className="min-w-[200px]">Hakem / E-posta</TableHead>
              <TableHead className="w-[140px]">Mesleki Rol</TableHead>
              <TableHead className="w-[140px]">Doğrulama Durumu</TableHead>
              <TableHead className="min-w-[240px]">Yetkinlik Alanları</TableHead>
              <TableHead className="w-[110px] text-center">İncelemeler</TableHead>
              <TableHead className="w-[100px] text-center">Yayınlama</TableHead>
              <TableHead className="w-[80px] text-right">İşlemler</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviewers.map((rev) => {
              const isVerified = rev.verificationStatus === 'verified'
              const isPendingStatus = rev.verificationStatus === 'pending'
              const isSuspended = rev.verificationStatus === 'suspended'

              return (
                <TableRow key={rev.userId} className="hover:bg-muted/30 transition-colors">
                  {/* Name and Email */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-bold text-xs">
                        {rev.userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-foreground">{rev.userName}</div>
                        <div className="text-xs text-muted-foreground">{rev.userEmail}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Professional Role & Specialty */}
                  <TableCell>
                    <Badge variant="outline" className="font-medium text-xs">
                      {ROLE_LABELS[rev.professionalRole] ?? rev.professionalRole}
                    </Badge>
                    {rev.specialty && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {rev.specialty}
                      </div>
                    )}
                  </TableCell>

                  {/* Verification Status */}
                  <TableCell>
                    {isVerified ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs font-semibold gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Doğrulandı</span>
                      </Badge>
                    ) : isPendingStatus ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-xs font-semibold gap-1">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>Bekliyor</span>
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30 text-xs font-semibold gap-1">
                        <Ban className="h-3.5 w-3.5" />
                        <span>{rev.verificationStatus}</span>
                      </Badge>
                    )}
                  </TableCell>

                  {/* Capabilities */}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rev.capabilities.slice(0, 3).map((cap) => (
                        <span
                          key={cap}
                          className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                        >
                          {cap}
                        </span>
                      ))}
                      {rev.capabilities.length > 3 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{rev.capabilities.length - 3}
                        </span>
                      )}
                      {rev.capabilities.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">Yetkinlik tanımlı değil</span>
                      )}
                    </div>
                  </TableCell>

                  {/* Review Stats */}
                  <TableCell className="text-center">
                    <div className="text-xs font-semibold text-foreground">
                      {rev.completedReviews} onay
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {rev.activeAssignments} aktif
                    </div>
                  </TableCell>

                  {/* Can Publish */}
                  <TableCell className="text-center">
                    {rev.canPublish ? (
                      <Badge variant="default" className="bg-emerald-600 text-[10px] font-semibold">
                        Yetkili
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* Actions Dropdown */}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={isPending}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 text-xs">
                        <DropdownMenuLabel>Hakem İşlemleri</DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        {isPendingStatus && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(rev.userId, 'verified')}
                            className="gap-2 text-emerald-600 dark:text-emerald-400 font-semibold"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Doğrula (Verify)</span>
                          </DropdownMenuItem>
                        )}

                        {isVerified && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(rev.userId, 'suspended')}
                            className="gap-2 text-rose-600 dark:text-rose-400"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            <span>Askıya Al (Suspend)</span>
                          </DropdownMenuItem>
                        )}

                        {isSuspended && (
                          <DropdownMenuItem
                            onClick={() => handleStatusChange(rev.userId, 'verified')}
                            className="gap-2 text-emerald-600 dark:text-emerald-400"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Yeniden Aktif Et</span>
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                          onClick={() => openCapabilitiesDialog(rev)}
                          className="gap-2"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                          <span>Yetkinlikleri Düzenle</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          onClick={() => handleTogglePublish(rev.userId, rev.canPublish)}
                          className="gap-2"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>
                            {rev.canPublish ? 'Yayınlama Yetkisini Al' : 'Yayınlama Yetkisi Ver'}
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Capabilities Edit Modal Dialog */}
      <Dialog open={capDialogOpen} onOpenChange={setCapDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Klinik Yetkinlikleri Düzenle</DialogTitle>
            <DialogDescription>
              {selectedReviewer?.userName} ({ROLE_LABELS[selectedReviewer?.professionalRole ?? '']}) için atanabilir
              etkileşim kategorilerini seçin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {ALL_CAPABILITIES.map((cap) => {
              const checked = selectedCaps.has(cap.key)
              return (
                <div key={cap.key} className="flex items-center space-x-2.5">
                  <Checkbox
                    id={`cap-${cap.key}`}
                    checked={checked}
                    onCheckedChange={(val) => {
                      const next = new Set(selectedCaps)
                      if (val) {
                        next.add(cap.key)
                      } else {
                        next.delete(cap.key)
                      }
                      setSelectedCaps(next)
                    }}
                  />
                  <label
                    htmlFor={`cap-${cap.key}`}
                    className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {cap.label} <span className="font-mono text-muted-foreground text-[10px]">({cap.key})</span>
                  </label>
                </div>
              )
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCapDialogOpen(false)}>
              İptal
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCapabilities}
              disabled={isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                'Yetkinlikleri Kaydet'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
