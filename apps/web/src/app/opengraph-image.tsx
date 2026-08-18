import { ImageResponse } from 'next/og'

// GitHub issue #60 / Faz 10, Prompt 10.2, GÖREV 3 — "OpenGraph görseli üret
// (app/opengraph-image.tsx, MARKA RENKLERİYLE)".
//
// Renkler public/brand/*.svg'deki marka hex'lerinin BİREBİR aynısı
// (globals.css'in oklch türevleri DEĞİL — Satori CSS değişkeni/oklch
// çözemez, bu yüzden marka paletinin kaynak hex değerleri kullanılıyor;
// aynı renkler, farklı gösterim):
//   koyu #12211B · birincil #1B7A5A · ikincil #4FA97F · accent #9FE1CB
//
// Logo SVG'si BURAYA GÖMÜLMEDİ: Satori harici dosya okumaz, SVG'yi
// data-URI olarak kopyalamak markayı ikinci bir yerde çoğaltmak olurdu.
// Onun yerine markanın GRAFİK ÖĞESİ (kesikli halka + nokta — yatay
// kilitteki aynı biçim) doğrudan JSX ile çiziliyor ve kelime markası
// tipografiyle veriliyor.
export const runtime = 'nodejs'
export const alt = 'Öğün — klinik diyetisyenler için besin bileşim motoru'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const BRAND = {
  dark: '#12211B',
  primary: '#1B7A5A',
  secondary: '#4FA97F',
  accent: '#9FE1CB',
}

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: `linear-gradient(135deg, ${BRAND.dark} 0%, #16342A 100%)`,
          padding: 72,
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              border: `10px solid ${BRAND.secondary}`,
              borderRightColor: 'transparent',
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: 2, color: BRAND.accent }}>ÖĞÜN</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.1, letterSpacing: -1.5 }}>
            Diyet listesi 15 dakikada değil, 90 saniyede.
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.4, color: BRAND.accent, maxWidth: 900 }}>
            Klinik diyetisyenler için gerçek besin bileşim motoru — serbest metin kutusu değil.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 24 }}>
          <div
            style={{
              display: 'flex',
              padding: '10px 22px',
              borderRadius: 999,
              background: BRAND.primary,
              color: '#FFFFFF',
              fontWeight: 600,
            }}
          >
            Windows · macOS
          </div>
          <div style={{ display: 'flex', color: BRAND.accent }}>BLS 4.0 + USDA FoodData Central</div>
        </div>
      </div>
    ),
    size,
  )
}
