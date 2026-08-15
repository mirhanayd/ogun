import { z } from 'zod'

// Auth formları için ortak Zod şemaları — Türkçe hata mesajlarıyla.

export const loginSchema = z.object({
  email: z.string().min(1, 'E-posta adresi gerekli.').email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Şifre gerekli.'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    name: z.string().min(2, 'Ad soyad en az 2 karakter olmalı.'),
    email: z.string().min(1, 'E-posta adresi gerekli.').email('Geçerli bir e-posta adresi girin.'),
    password: z.string().min(8, 'Şifre en az 8 karakter olmalı.'),
    passwordConfirm: z.string().min(1, 'Şifre tekrarı gerekli.'),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Şifreler eşleşmiyor.',
    path: ['passwordConfirm'],
  })

export type RegisterInput = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'E-posta adresi gerekli.').email('Geçerli bir e-posta adresi girin.'),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Şifre en az 8 karakter olmalı.'),
    passwordConfirm: z.string().min(1, 'Şifre tekrarı gerekli.'),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Şifreler eşleşmiyor.',
    path: ['passwordConfirm'],
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
