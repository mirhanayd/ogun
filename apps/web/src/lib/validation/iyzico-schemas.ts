import { z } from 'zod'

export const iyzicoCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Ad zorunludur.').max(60),
  surname: z.string().trim().min(2, 'Soyad zorunludur.').max(60),
  gsmNumber: z.string().trim().regex(/^\+90\d{10}$/, 'Telefon +905xxxxxxxxx biçiminde olmalıdır.'),
  identityNumber: z.string().trim().regex(/^\d{11}$/, 'T.C. kimlik numarası 11 haneli olmalıdır.'),
  address: z.string().trim().min(10, 'Fatura adresini eksiksiz girin.').max(300),
  city: z.string().trim().min(2, 'Şehir zorunludur.').max(60),
  zipCode: z.string().trim().regex(/^\d{5}$/, 'Posta kodu 5 haneli olmalıdır.'),
})
