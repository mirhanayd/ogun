'use client'

import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'
import { KeyRound, Monitor } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { isNativeShell } from '@/lib/native-shell'
import type { DesktopOfflineProfile } from '@/lib/desktop-offline'

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
export function DesktopSettingsCard({
  userId,
  email,
  displayName,
  clinicId,
  clinicName,
  role,
}: {
  userId: string
  email: string
  displayName: string
  clinicId: string
  clinicName: string
  role: string
}) {
  const [isNative, setIsNative] = useState(false)
  const [minimizeToTray, setMinimizeToTray] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [newPinAgain, setNewPinAgain] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [pinConfigured, setPinConfigured] = useState(false)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!isNativeShell()) return
    setIsNative(true)
    // Kullanıcı hangi DERLEMENIN kurulu olduğunu ekranda görsün diye —
    // "aynı dosya adıyla aynı sürümü kurup eskiyi test etmeyi" önler
    // (0.2.6 gerileme araştırmasındaki belirsizlik dersidir).
    void getVersion()
      .then(setAppVersion)
      .catch((err) => console.warn('[desktop-settings-card] sürüm okunamadı', err))
    void invoke<boolean>('get_minimize_to_tray_setting')
      .then((value) => {
        setMinimizeToTray(value)
        setLoaded(true)
      })
      .catch((err) => {
        console.warn('[desktop-settings-card] ayar okunamadı', err)
        setLoaded(true)
      })
    void invoke<DesktopOfflineProfile[]>('list_offline_profiles')
      .then((profiles) => {
        setPinConfigured(
          profiles.find((profile) => profile.userId === userId)?.pinConfigured ?? false,
        )
      })
      .catch((err) => console.warn('[desktop-settings-card] hızlı giriş profili okunamadı', err))
  }, [userId])

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
      // PIN, cihaz kasasındaki profil kaydına bağlıdır (configure_offline_pin
      // kaydı arar). Kayıt her ne sebeple yoksa (farklı hesapla giriş,
      // köprü yazımının başarısız olması vb.) burada GARANTI edilir — ve
      // bu adımın hatası kullanıcıya görünür (sessiz console.warn değil).
      await invoke('upsert_offline_profile', {
        profile: {
          userId,
          email,
          displayName,
          clinicId,
          clinicName,
          role,
          lastSyncedAt: null,
        },
      })
      await invoke('configure_offline_pin', {
        userId,
        currentPin,
        newPin,
      })
      setCurrentPin('')
      setNewPin('')
      setNewPinAgain('')
      setPinConfigured(true)
      toast.success(
        pinConfigured ? 'Hızlı giriş PIN’i güncellendi.' : 'Hızlı giriş PIN’i ayarlandı.',
      )
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
          {appVersion ? ` Kurulu sürüm: v${appVersion}.` : ''}
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
            Hızlı giriş PIN’i
          </div>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            Kayıtlı hesabınızı parola yazmadan hızlıca açar. PIN çevrimiçi veya çevrimdışı mod
            seçmez; bağlantı durumu uygulama tarafından ayrıca belirlenir.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {pinConfigured ? (
              <Input
                type="password"
                inputMode="numeric"
                value={currentPin}
                onChange={(event) =>
                  setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 8))
                }
                placeholder="Mevcut PIN"
                className="rounded-xl"
              />
            ) : (
              <div className="flex items-center rounded-xl border border-dashed border-border px-3 text-xs text-muted-foreground">
                Henüz PIN ayarlanmadı
              </div>
            )}
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
            {pinConfigured ? 'PIN’i değiştir' : 'PIN oluştur'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
