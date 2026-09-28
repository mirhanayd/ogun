import { NewClientForm } from './new-client-form'
import { createClientAction } from '../actions'
import { redirect } from 'next/navigation'
import { ScreenFrame } from '@/screens/screen-frame'
import { OgunAddClient } from '@/components/ogun-icons'

// /danisanlar/yeni — GitHub issue #17 / Prompt 4.1, GÖREV 3: "tek sayfalık,
// hızlı" yeni danışan formu. Kimlik doğrulama/klinik kontrolü bu sayfada
// AYRICA yapılmıyor — app/(app)/layout.tsx zaten tüm bu route group'u
// requireClinic() ile korur (bkz. o dosyadaki getAppShellContext), form
// gönderiminin kendisi de actions.ts'te ayrıca requireClinic() çağırır.
export default function YeniDanisanPage() {
  return (
    <ScreenFrame title="Yeni danışan" description="Kimlik bilgilerini ve rıza onayını kaydedin. Diğer bilgileri profilden tamamlayabilirsiniz." icon={OgunAddClient}>
      <NewClientForm onSave={createClientAction} onCreated={async (clientId) => { 'use server'; redirect(`/danisanlar/${clientId}`) }} />
    </ScreenFrame>
  )
}
