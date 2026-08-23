'use client'

import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { KeyRound, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
export function DesktopSettingsCard({ userId }: { userId: string }) {
  const [isNative, setIsNative] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPinAgain, setNewPinAgain] = useState('')
  const [savingPin, setSavingPin] = useState(false)

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

  async function handlePinChange() {
    if (!/^\d{4,8}$/.test(newPin)) {
      toast.error('Yeni PIN 4-8 rakamdan oluşmalıdır.')
      return
    }
    if (newPin !== newPinAgain) {
      toast.error('Yeni PIN alanları eşleşmiyor.')
      return
    }
    setSavingPin(true)
    try {
      await invoke('configure_offline_pin', {
        userId,
        currentPin,
        newPin,
      })
      setCurrentPin('')
      setNewPin('')
      setNewPinAgain('')
      toast.success('Yerel giriş PIN’i güncellendi.')
    } catch (error) {
      toast.error('PIN güncellenemedi.', { description: String(error) })
    } finally {
      setSavingPin(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="size-4 text-primary" />
          Masaüstü uygulaması
        </CardTitle>
        <CardDescription>
          Bu ayar yalnızca Öğün masaüstü uygulamasında (Tauri) görünür.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={minimizeToTray}
            disabled={!loaded}
            onCheckedChange={(v) => handleToggle(v === true)}
          />
          Pencereyi kapatınca uygulamayı tamamen kapatma, görev çubuğu simgesinde tut
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Kapalıysa pencerenin kapatma (X) düğmesi uygulamayı tamamen sonlandırır. Her iki durumda
          da tray simgesindeki &quot;Çıkış&quot; her zaman uygulamayı tamamen kapatır.
        </p>
        <div className="mt-5 border-t border-border/70 pt-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4 text-primary" />
            Çevrimdışı giriş PIN’i
          </div>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            İnternet yokken bu bilgisayardaki hesabınızı açmak için kullanılır.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Input
              type="password"
              inputMode="numeric"
              value={currentPin}
              onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Mevcut PIN"
              className="rounded-xl"
            />
            <Input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Yeni PIN"
              className="rounded-xl"
            />
            <Input
              type="password"
              inputMode="numeric"
              value={newPinAgain}
              onChange={(event) =>
                setNewPinAgain(event.target.value.replace(/\D/g, '').slice(0, 8))
              }
              placeholder="Yeni PIN tekrar"
              className="rounded-xl"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-3 rounded-xl"
            disabled={savingPin}
            onClick={handlePinChange}
          >
            PIN’i değiştir
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
