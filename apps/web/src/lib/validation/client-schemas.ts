import { z } from 'zod'

// KVKK rıza kuralı (GitHub issue #12 / Prompt 3.3 — GÖREV 3): bir danışan
// kaydı, rıza alınmadan "tamamlanmış"/aktif sayılamaz. Danışan kaydının
// TAMAMI (ad, soyad, doğum tarihi vb.) Prompt 4.1'de (henüz açılmamış,
// gelecek bir issue) kurulacak — bu yüzden burada bir UI akışı YOK, sadece
// o akışın rıza adımının çağıracağı doğrulayıcı: hem bir Zod şeması (form
// doğrulaması için) hem de var olan bir kaydı bu kurala karşı kontrol eden
// bir invaryant fonksiyonu (assertClientConsentComplete).
//
// kvkkConsentAt/kvkkConsentVersion VE explicitConsentAt BİLEREK ayrı zorunlu
// alanlar: KVKK m.5/6 genel işleme şartları ile m.6/2 özel nitelikli veri
// (sağlık verisi) için açık rıza şartı FARKLI hukuki dayanaklardır, aynı onay
// kutusuyla birleştirilemez (bkz. schema/clients.ts üstündeki not).
// marketingConsentAt ise ayrı VE opsiyonel — kaydın tamamlanması için gerekmez.
export const clientConsentSchema = z.object({
  kvkkConsentAt: z.date({ required_error: 'KVKK aydınlatma metni onayı zorunludur.' }),
  kvkkConsentVersion: z
    .string()
    .trim()
    .min(1, 'Onaylanan aydınlatma metninin sürümü belirtilmelidir.'),
  explicitConsentAt: z.date({
    required_error: 'Özel nitelikli kişisel veri (sağlık verisi) için açık rıza zorunludur.',
  }),
  marketingConsentAt: z.date().optional().nullable(),
})
export type ClientConsentInput = z.infer<typeof clientConsentSchema>

// Yeni oluşturulan (henüz rıza alanları NULL olabilen) bir danışan satırının
// rıza durumunu bu kurala karşı kontrol eder. clients tablosu satırı,
// Prompt 4.1'in "15 saniyeden kısa hızlı kayıt" hedefiyle çelişmesin diye
// rıza olmadan da OLUŞTURULABİLİR — ama bu fonksiyon geçmeden kayıt "aktif"
// durumuna GEÇEMEZ (gerçek `status` alanı ve geçiş noktası Prompt 4.1'de).
const requiredConsentShape = clientConsentSchema.pick({ kvkkConsentAt: true, explicitConsentAt: true })

export interface ClientConsentState {
  kvkkConsentAt: Date | null
  explicitConsentAt: Date | null
}

export function isClientConsentComplete(consent: ClientConsentState): boolean {
  return requiredConsentShape.safeParse(consent).success
}

export class ClientConsentIncompleteError extends Error {
  constructor(message = 'Danışan kaydı, KVKK ve açık rıza alınmadan tamamlanamaz.') {
    super(message)
    this.name = 'ClientConsentIncompleteError'
  }
}

// Gelecekteki danışan oluşturma/aktifleştirme server action'ının (Prompt 4.1)
// çağıracağı invaryant kontrolü — kural sağlanmıyorsa fırlatır.
export function assertClientConsentComplete(consent: ClientConsentState): void {
  if (!isClientConsentComplete(consent)) {
    throw new ClientConsentIncompleteError()
  }
}
