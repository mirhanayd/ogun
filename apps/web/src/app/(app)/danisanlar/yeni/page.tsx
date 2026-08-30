import { NewClientForm } from './new-client-form'
import { createClientAction } from '../actions'
import { redirect } from 'next/navigation'

// /danisanlar/yeni — GitHub issue #17 / Prompt 4.1, GÖREV 3: "tek sayfalık,
// hızlı" yeni danışan formu. Kimlik doğrulama/klinik kontrolü bu sayfada
// AYRICA yapılmıyor — app/(app)/layout.tsx zaten tüm bu route group'u
// requireClinic() ile korur (bkz. o dosyadaki getAppShellContext), form
// gönderiminin kendisi de actions.ts'te ayrıca requireClinic() çağırır.
export default function YeniDanisanPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Yeni danışan</h1>
        <p className="text-sm text-muted-foreground">
          Sadece ad, soyad ve rıza onayı zorunludur — gerisini daha sonra doldurabilirsiniz.
        </p>
      </div>
      <NewClientForm onSave={createClientAction} onCreated={async (clientId) => { 'use server'; redirect(`/danisanlar/${clientId}`) }} />
    </div>
  )
}
