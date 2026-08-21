import { z } from 'zod'

export const inviteDietitianSchema = z.object({
  name: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalıdır.').max(120),
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.').max(254),
})
export type InviteDietitianValues = z.infer<typeof inviteDietitianSchema>

export const acceptClinicInvitationSchema = z
  .object({
    password: z.string().min(8, 'Şifre en az 8 karakter olmalıdır.').max(128),
    confirmPassword: z.string().min(1, 'Şifre tekrarı zorunludur.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor.',
    path: ['confirmPassword'],
  })
export type AcceptClinicInvitationValues = z.infer<typeof acceptClinicInvitationSchema>
