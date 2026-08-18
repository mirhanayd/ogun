import { ImageResponse } from 'next/og'

// GitHub issue #59 / Faz 10, Prompt 10.1, GÖREV 4 — Apple touch icon.
//
// NEDEN .tsx, NEDEN .svg DEĞİL: Next.js'in statik metadata dosya kuralı
// `apple-icon` için YALNIZCA jpg/jpeg/png kabul ediyor (bkz. next/dist/lib/
// metadata/is-metadata-route.js, STATIC_METADATA_IMAGES.apple), `icon` için
// svg de kabul ediyor — bu yüzden app/icon.svg düz bir dosya, apple-icon ise
// derleme sırasında PNG üreten dinamik bir rota. Safari zaten SVG bir
// apple-touch-icon'u render etmiyor, dolayısıyla PNG şart.
//
// iOS ikonu KENDİ maskesini uyguladığı için marka karesinin köşeleri burada
// YUVARLATILMIYOR (public/brand/ogun-uygulama-ikonu.svg'deki rx=22 atıldı);
// zemin düz marka yeşili, üstünde yalnızca halka + iki nokta.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// ogun-uygulama-ikonu.svg'nin geometrisi (viewBox 0 0 88 88), zeminsiz.
// Salt ASCII tutuldu — base64'e çevrilirken sorun çıkmasın diye.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 88 88" width="88" height="88">
  <circle cx="44" cy="52" r="20" fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="7"/>
  <circle cx="-52" cy="44" r="20" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-dasharray="86 40" transform="rotate(-90)"/>
  <circle cx="35" cy="21" r="4" fill="#FFFFFF"/>
  <circle cx="53" cy="21" r="4" fill="#9FE1CB"/>
</svg>`

export default function AppleIcon() {
  const mark = `data:image/svg+xml;base64,${Buffer.from(MARK, 'utf8').toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#1B7A5A',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} alt="" width={180} height={180} />
      </div>
    ),
    { ...size },
  )
}
