'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Stethoscope, Pill, Apple, UserCheck, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { requestReviewerRoleAction } from '../actions'

const ROLES = [
  {
    id: 'pharmacist',
    title: 'Eczacı (Pharmacist)',
    description: 'İlaç-besin, ilaç-takviye etkileşimleri ve farmakolojik mekanizmalar için birincil inceleme.',
    icon: Pill,
  },
  {
    id: 'physician',
    title: 'Hekim (Physician)',
    description: 'Klinik şiddet derecelendirmesi, farmakolojik ve medikal durum etkileşimleri incelemesi.',
    icon: Stethoscope,
  },
  {
    id: 'dietitian',
    title: 'Diyetisyen (Dietitian)',
    description: 'Besin-besin öğesi, durum-besin etkileşimleri ve beslenme yönetimi önerileri incelemesi.',
    icon: Apple,
  },
]

export function RequestRoleCard() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<string>('pharmacist')
  const [specialty, setSpecialty] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.set('professionalRole', selectedRole)
      if (specialty.trim()) {
        formData.set('specialty', specialty.trim())
      }

      const result = await requestReviewerRoleAction(formData)
      if (!result.success) {
        setError(result.error ?? 'Profil başvurusu tamamlanamadı.')
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-12 px-4 sm:px-6">
      <Card className="border-border/80 shadow-md">
        <CardHeader className="text-center pb-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600">
            <UserCheck className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl font-bold">Klinik Hakem Profili Başvurusu</CardTitle>
          <CardDescription className="text-sm">
            Ogun Klinik Bilgi Tabanı incelemelerine katılabilmek için mesleki rolünüzü belirleyin.
            Başvurunuz bir Klinik Yönetici tarafından doğrulandıktan sonra onay yetkileriniz aktifleşecektir.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Hata</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Mesleki Rolünüzü Seçin</Label>
              <div className="grid gap-3 sm:grid-cols-1">
                {ROLES.map((role) => {
                  const Icon = role.icon
                  const isSelected = selectedRole === role.id
                  return (
                    <div
                      key={role.id}
                      onClick={() => setSelectedRole(role.id)}
                      className={`flex cursor-pointer items-start gap-3.5 rounded-lg border p-4 transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/20'
                          : 'border-border hover:border-border/80 hover:bg-muted/40'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{role.title}</span>
                          <input
                            type="radio"
                            name="role"
                            value={role.id}
                            checked={isSelected}
                            onChange={() => setSelectedRole(role.id)}
                            className="text-emerald-600 focus:ring-emerald-500"
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                          {role.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialty" className="text-sm font-semibold">
                Uzmanlık Alanı / Alt Branş (Opsiyonel)
              </Label>
              <Input
                id="specialty"
                placeholder="Örn. Onkoloji, Nefroloji, Klinik Beslenme, Kardiyoloji..."
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                maxLength={60}
              />
              <p className="text-xs text-muted-foreground">
                Özel branş gerektiren etkileşimlerin yönlendirilmesinde kullanılır.
              </p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Başvuru Kaydediliyor...
                </>
              ) : (
                'Hakem Profilimi Oluştur'
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Profiliniz &quot;Doğrulama Bekliyor&quot; durumunda açılacaktır. Sistem yöneticisi onaylayana kadar
              adayları inceleyebilir, karar taslakları hazırlayabilirsiniz.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
