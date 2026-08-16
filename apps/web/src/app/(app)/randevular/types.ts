// TİP-ONLY re-export — calendar-grid.tsx/month-grid.tsx gibi 'use client'
// bileşenleri @ogun/db/queries'i DOĞRUDAN içe aktarmıyor (server-only zincir
// sürüklenmesin diye, client-schemas.ts'teki AYNI desen), sadece bu dosyadan
// TİP alıyor.
export type { AppointmentListRow } from '@ogun/db/queries'
