import { z } from 'zod'

// Auth sayfalarında kullanılan Zod şemaları. Hata mesajları Türkçe — bkz.
// apps/web/src/app/(auth)/*. Formlar react-hook-form + @hookform/resolvers/zod
// ile bu şemalara bağlanır.

const emailField = z.string().min(1, 'E-posta adresi zorunludur.').email('Geçerli bir e-posta adresi girin.')

const passwordField = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalıdır.')
  .max(128, 'Şifre en fazla 128 karakter olabilir.')

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Şifre zorunludur.'),
})
export type LoginFormValues = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    name: z.string().min(2, 'Ad soyad en az 2 karakter olmalıdır.'),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string().min(1, 'Şifre tekrarı zorunludur.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor.',
    path: ['confirmPassword'],
  })
export type RegisterFormValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: emailField,
})
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Şifre tekrarı zorunludur.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Şifreler eşleşmiyor.',
    path: ['confirmPassword'],
  })
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>
