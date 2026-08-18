'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Monitor } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { isNativeShell } from '@/lib/native-shell'

// GitHub issue #53 / Prompt 9.3, GÖREV 2 — "Pencere kapatılınca uygulama
// tamamen kapanmasın, tray'de kalsın ... Bunu ayarlarda kapatılabilir yap."
// Tauri kabuğunda henüz AYRI bir "uygulama ayarları" yüzeyi YOK (bkz.
// apps/desktop/src-tauri/src/settings.rs dosya başı "TASARIM KARARI" notu)
// — bu tercihi apps/web'in MEVCUT /ayarlar sayfasına, SADECE native
// kabukta görünen ek bir kart olarak ekliyoruz (web tarayıcısında bu kart
// hiç RENDER edilmez — `isNativeShell()` false iken `null` döner).
//
// Değer sunucuya HİÇ GİTMEZ — `get_minimize_to_tray_setting`/
// `set_minimize_to_tray_setting` Tauri komutları (bkz. settings.rs)
// doğrudan yerel bir JSON dosyasını okur/yazar; bu bileşen SADECE bir
// istemci arayüzü.
export function DesktopSettingsCard() {
  const [isNative, setIsNative] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!isNativeShell()) return
    setIsNative(true)
    void invoke<boolean>('get_minimize_to_tray_setting')
      .then((value) => {
        setMinimizeToTray(value)
        setLoaded(true)
      })
      .catch((err) => {
        console.warn('[desktop-settings-card] ayar okunamadı', err)
        setLoaded(true)
      })
  }, [])

  if (!isNative) return null

  async function handleToggle(checked: boolean) {
    setMinimizeToTray(checked)
    try {
      await invoke('set_minimize_to_tray_setting', { enabled: checked })
    } catch (err) {
      console.warn('[desktop-settings-card] ayar kaydedilemedi', err)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="size-4 text-primary" />
          Masaüstü uygulaması
        </CardTitle>
        <CardDescription>Bu ayar yalnızca Öğün masaüstü uygulamasında (Tauri) görünür.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={minimizeToTray} disabled={!loaded} onCheckedChange={(v) => handleToggle(v === true)} />
          Pencereyi kapatınca uygulamayı tamamen kapatma, görev çubuğu simgesinde tut
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Kapalıysa pencerenin kapatma (X) düğmesi uygulamayı tamamen sonlandırır. Her iki durumda da tray simgesindeki
          &quot;Çıkış&quot; her zaman uygulamayı tamamen kapatır.
        </p>
      </CardContent>
    </Card>
  )
}
