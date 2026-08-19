'use client'

import { useEffect, useState } from 'react'
import { CloudOff } from 'lucide-react'

// GitHub issue #62 / Faz 10, Prompt 10.4, GÖREV 2 — "Çevrimdışı göstergesi:
// plan editöründe var, uygulama geneline yay."
//
// KAPSAM AYRIMI (bilerek): plan editöründeki rozet (bkz. plan-editor.tsx
// SaveStatusIndicator) O EKRANIN kaydetme kuyruğunun durumunu söyler
// ("Bağlantı yok, yerel kayıt — 2 bekliyor"); yerel taslak korunduğu için
// orada mesaj GÜVEN VERİCİdir. Bu bileşen ise uygulamanın GERİ KALANI için
// çok daha kritik olan gerçeği söyler: plan editörü DIŞINDA hiçbir ekranın
// çevrimdışı kuyruğu YOK, yani şu anda yapılan bir kayıt/güncelleme
// kaybolur. Bu yüzden metin "yerel kayıt" DEMİYOR, ne yapılacağını söylüyor.
//
// Neden `navigator.onLine`: tarayıcının bu bayrağı "ağ arayüzü var mı"
// sorusunu yanıtlar, "sunucuya ulaşılıyor mu" sorusunu DEĞİL — yani yanlış
// pozitif verebilir (bağlı ama internet yok). Buna karşılık YANLIŞ NEGATİF
// vermez: false ise gerçekten bağlantı yoktur. Gösterge bu yüzden yalnızca
// `false` durumunda görünür; "çevrimiçi" olduğunu iddia eden bir rozet YOK.
export function OfflineIndicator() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    function handleOnline() {
      setOffline(false)
    }
    function handleOffline() {
      setOffline(true)
    }
    // İlk okuma effect İÇİNDE — sunucu render'ında `navigator` yok ve
    // useState başlangıç değerinde okumak hidrasyon uyumsuzluğu üretirdi.
    setOffline(!navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="fixed inset-x-0 bottom-16 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-destructive/40 bg-destructive px-3 py-1.5 text-helper font-medium text-white shadow-lg md:bottom-4"
    >
      <CloudOff className="size-3.5 shrink-0" />
      <span>İnternet bağlantısı yok — değişiklikleriniz kaydedilmeyebilir.</span>
    </div>
  )
}
