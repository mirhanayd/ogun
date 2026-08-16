'use client'

// GitHub issue #35 / Prompt 6.1 — TARAYICI tarafı font kaydı. @ogun/pdf'in
// fonts.node.ts'i (bkz. o dosyanın notu) node:fs kullandığı için burada
// KULLANILAMAZ — react-pdf'in tarayıcı derlemesi Font.register'a bir URL
// (veya ArrayBuffer) verilmesini bekler. Bu yüzden AYNI .ttf dosyalarının
// bir kopyası apps/web/public/fonts/pdf/ altına da vendor edildi (kaynak:
// packages/pdf/src/fonts/*.ttf — bkz. o klasörün notu) ve burada public URL
// olarak register ediliyor.
import { Font } from '@react-pdf/renderer'
import { INTER_FONT_FAMILY } from '@ogun/pdf'

let registered = false

export function registerPdfFontsClient(): void {
  if (registered) return
  Font.register({
    family: INTER_FONT_FAMILY,
    fonts: [
      { src: '/fonts/pdf/Inter-Regular.ttf', fontWeight: 400 },
      { src: '/fonts/pdf/Inter-Medium.ttf', fontWeight: 500 },
      { src: '/fonts/pdf/Inter-SemiBold.ttf', fontWeight: 600 },
      { src: '/fonts/pdf/Inter-Bold.ttf', fontWeight: 700 },
    ],
  })
  Font.registerHyphenationCallback((word: string) => [word])
  registered = true
}
