/**
 * Öğün — kategorik grafik paleti doğrulayıcı.
 *
 * GitHub issue #59 / Faz 10, Prompt 10.1, GÖREV 2.
 *
 * NOT (issue #59 spesifikasyon düzeltmesi): faz-10-ui-cilasi.md "scripts/
 * validate_palette.js zaten var" diyor — YOKTU. Palet issue #26'da dataviz
 * skill'inin doğrulayıcısıyla oturum içinde doğrulanmış ama script hiç
 * commit'lenmemişti. Bu dosya o boşluğu kapatır: artık palet, DEĞİŞTİĞİNDE
 * tekrar çalıştırılabilir bir kontrolün arkasında.
 *
 * Yöntem — Anthropic "dataviz" skill'inin altı kontrolünden ÖLÇÜLEBİLİR
 * olan dördü (1 "sabit ton sırası" ve 6 "dokümante palet" yapısal
 * kurallardır, hex'ten ölçülemez):
 *
 *   2.  Açıklık bandı        — OKLCH L, moda göre bant içinde
 *   3.  Doygunluk tabanı     — OKLCH C >= 0.10 (altında ton gri okunur)
 *   4.  CVD ayrımı           — Machado-Oliveira-Fernandes (2009) şiddet 1.0
 *                              protan/deutan simülasyonunda OKLab ΔE (×100)
 *   4b. Normal görüş tabanı  — simüle edilmemiş görüşte en kötü çift ΔE >= 15
 *   5.  Yüzeye karşı kontrast— WCAG oranı
 *
 * KULLANIM
 *   node scripts/validate_palette.js
 *       → apps/web/src/app/globals.css'i okur, --chart-1..6 ve --card
 *         değerlerini :root ve .dark bloklarından çıkarır, İKİ modu da
 *         gerçek yüzeylerine karşı doğrular. CI/geliştirici için varsayılan.
 *
 *   node scripts/validate_palette.js "#2a78d6,#eb6834,..." --mode light --surface "#fefffe"
 *       → serbest palet doğrulama.
 *
 *   Ek bayraklar: --pairs all   (scatter/bubble/harita/small-multiples için;
 *                                herhangi iki işaret yan yana gelebilir)
 *
 * ÇIKIŞ KODU: sert bir FAIL yoksa 0, varsa 1. WARN bantları (CVD 6–8 taban
 * bandı, 3:1 altı kontrast) 0 döndürür ama İKİNCİL KODLAMA zorunlu kılar
 * (doğrudan etiket, boşluk veya desen).
 */

'use strict'

const fs = require('node:fs')
const path = require('node:path')

// ── eşikler ──────────────────────────────────────────────────────────────────
const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] } // OKLCH L
const CHROMA_FLOOR = 0.1 // OKLCH C
const CVD_TARGET = 8.0
const CVD_FLOOR = 6.0 // OKLab ΔE×100, min(protan, deutan)
const NORMAL_FLOOR = 15.0 // OKLab ΔE×100, simüle edilmemiş görüş
const CONTRAST_MIN = 3.0 // WCAG, yüzeye karşı
const DEFAULT_SURFACE = { light: '#fcfcfb', dark: '#1a1a19' }

// Machado, Oliveira & Fernandes (2009), şiddet 1.0 (doğrusal RGB).
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
}

// ── renk dönüşümleri ─────────────────────────────────────────────────────────
const WS_RUN = '[ \\t\\n\\v\\f\\r\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+'
const stripWs = (v) => v.replace(new RegExp(`^${WS_RUN}|${WS_RUN}$`, 'g'), '')
const splitColors = (raw) => (raw || '').split(',').map(stripWs).filter(Boolean)
const isHexColor = (v) => /^#?[0-9a-fA-F]{6}$/.test(v)

const hex2srgb = (h) => {
  h = h.trim().replace(/^#/, '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
}
const s2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lin2s = (c) => {
  c = Math.max(0, Math.min(1, c))
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}
const lin = (h) => hex2srgb(h).map(s2lin)
const relLum = (h) => {
  const [r, g, b] = lin(h)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function oklabFromLin([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const oklch = (h) => {
  const [L, a, b] = oklabFromLin(lin(h))
  return [L, Math.hypot(a, b)]
}

// oklch(L C H) → #rrggbb. globals.css'teki yüzey token'ları oklch yazıldığı
// için (issue #59: "hex bırakma") doğrulayıcının bunları çevirmesi gerekiyor.
function oklchToHex(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180)
  const b = C * Math.sin((H * Math.PI) / 180)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(lin2s)
  return '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
}

function simulate(h, kind) {
  const [r, g, b] = lin(h)
  const M = MACHADO[kind]
  const clamp = (c) => Math.max(0, Math.min(1, c))
  return [
    clamp(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ]
}
function deltaE(h1, h2, kind) {
  const a = oklabFromLin(kind ? simulate(h1, kind) : lin(h1))
  const b = oklabFromLin(kind ? simulate(h2, kind) : lin(h2))
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

// ── kontroller ───────────────────────────────────────────────────────────────
function validate(palette, { mode = 'light', surface, pairs = 'adjacent' } = {}) {
  surface = surface || DEFAULT_SURFACE[mode]
  const [lo, hi] = BAND[mode]
  const report = []
  let ok = true

  // 2. açıklık bandı
  const offband = palette
    .filter((c) => {
      const L = oklch(c)[0]
      return L < lo || L > hi
    })
    .map((c) => [c, +oklch(c)[0].toFixed(3)])
  if (offband.length) ok = false
  report.push([
    'Açıklık bandı',
    !offband.length,
    offband.length ? `bant dışı: ${JSON.stringify(offband)}` : `${palette.length} renk de L ${lo}–${hi} içinde`,
  ])

  // 3. doygunluk tabanı
  const lowc = palette.filter((c) => oklch(c)[1] < CHROMA_FLOOR).map((c) => [c, +oklch(c)[1].toFixed(3)])
  if (lowc.length) ok = false
  report.push([
    'Doygunluk tabanı',
    !lowc.length,
    lowc.length ? `taban altı (gri okunur): ${JSON.stringify(lowc)}` : `${palette.length} renk de >= ${CHROMA_FLOOR}`,
  ])

  // 4. CVD ayrımı
  const n = palette.length
  const pairlist =
    pairs === 'all'
      ? Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, k) => [i, i + 1 + k])).flat()
      : Array.from({ length: n - 1 }, (_, i) => [i, i + 1])
  const label = pairs === 'all' ? 'tüm çiftler' : 'komşu'
  let worst = null
  for (const kind of ['protan', 'deutan']) {
    for (const [i, j] of pairlist) {
      const d = deltaE(palette[i], palette[j], kind)
      if (worst === null || d < worst[0]) worst = [d, kind, palette[i], palette[j]]
    }
  }
  const tri = pairlist.length ? Math.min(...pairlist.map(([i, j]) => deltaE(palette[i], palette[j], 'tritan'))) : 99
  const wd = worst ? worst[0] : 99
  const cvdState = wd >= CVD_TARGET ? 'pass' : wd >= CVD_FLOOR ? 'floor' : 'fail'
  if (cvdState === 'fail') ok = false
  report.push([
    'CVD ayrımı',
    cvdState,
    worst
      ? `en kötü ${label} ${worst[3]}↔${worst[2]} ΔE ${wd.toFixed(1)} (${worst[1]}) · tritan ${tri.toFixed(1)}`
      : 'n/a',
  ])

  // 4b. normal görüş tabanı (sert kapı — ikincil kodlama mazeret değil)
  let nworst = null
  for (const [i, j] of pairlist) {
    const d = deltaE(palette[i], palette[j])
    if (nworst === null || d < nworst[0]) nworst = [d, palette[i], palette[j]]
  }
  const nd = nworst ? nworst[0] : 99
  const norState = nd >= NORMAL_FLOOR ? 'pass' : 'fail'
  if (norState === 'fail') ok = false
  report.push([
    'Normal görüş tabanı',
    norState,
    nworst
      ? `en kötü ${label} ${nworst[2]}↔${nworst[1]} ΔE ${nd.toFixed(1)}` +
        (nd >= NORMAL_FLOOR ? '' : ` — ${NORMAL_FLOOR} altında, tam renk görüşünde bile ayırt etmek zor`)
      : 'n/a',
  ])

  // 5. yüzeye karşı kontrast (3:1 altı sert hata değil — etiket/tablo telafisi)
  const low = palette.filter((c) => contrast(c, surface) < CONTRAST_MIN).map((c) => [c, +contrast(c, surface).toFixed(2)])
  report.push([
    'Yüzeye karşı kontrast',
    low.length ? 'relief' : 'pass',
    low.length
      ? `${CONTRAST_MIN}:1 altı — telafi zorunlu (görünür etiket veya tablo görünümü): ${JSON.stringify(low)}`
      : `${palette.length} renk de >= ${CONTRAST_MIN}:1`,
  ])

  return { report, ok }
}

// ── globals.css'ten okuma ────────────────────────────────────────────────────
const GLOBALS_CSS = path.join(__dirname, '..', 'apps', 'web', 'src', 'app', 'globals.css')

function blockOf(css, selector) {
  // İlgili seçicinin İLK bloğunu al. Token blokları iç içe küme parantezi
  // içermiyor, bu yüzden ilk '}' güvenli bir sonlandırıcı.
  const start = css.indexOf(selector + ' {')
  if (start === -1) return null
  const end = css.indexOf('}', start)
  return end === -1 ? null : css.slice(start, end)
}

function tokenOf(block, name) {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return m ? m[1].trim() : null
}

function toHex(value, what) {
  if (isHexColor(value)) return value.startsWith('#') ? value : '#' + value
  const m = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/)
  if (!m) throw new Error(`${what}: "${value}" hex ya da oklch(L C H) değil`)
  return oklchToHex(Number(m[1]), Number(m[2]), Number(m[3]))
}

function readFromGlobals() {
  const css = fs.readFileSync(GLOBALS_CSS, 'utf8')
  return ['light', 'dark'].map((mode) => {
    const selector = mode === 'light' ? ':root' : '.dark'
    const block = blockOf(css, selector)
    if (!block) throw new Error(`globals.css içinde "${selector}" bloğu bulunamadı`)
    const palette = [1, 2, 3, 4, 5, 6].map((i) => {
      const v = tokenOf(block, `chart-${i}`)
      if (!v) throw new Error(`${selector} içinde --chart-${i} yok`)
      return toHex(v, `${selector} --chart-${i}`)
    })
    // Grafikler Card içinde render ediliyor (bkz. progress-charts.tsx,
    // lab-chart.tsx) — kontrastın anlamlı olması için yüzey --card olmalı,
    // --background değil.
    const surface = toHex(tokenOf(block, 'card'), `${selector} --card`)
    return { mode, palette, surface, selector }
  })
}

// ── çıktı ────────────────────────────────────────────────────────────────────
const GLYPH = { true: 'PASS', false: 'FAIL', pass: 'PASS', floor: 'WARN', fail: 'FAIL', relief: 'WARN' }

function printReport({ report, ok }, { mode, surface, n, note }) {
  console.log(`\nPalet (${mode}, yüzey ${surface}${note ? `, ${note}` : ''}): ${n} slot`)
  for (const [name, state, detail] of report) {
    console.log(`  [${String(GLYPH[state] != null ? GLYPH[state] : state).padEnd(4)}] ${name.padEnd(22)} ${detail}`)
  }
  console.log(
    `\n  → ${ok ? 'TÜM KONTROLLER GEÇTİ' : 'BAŞARISIZ — işaretli kontrolleri düzelt'}` +
      '  (CVD 6–8 taban bandı YALNIZCA ikincil kodlamayla yasal: doğrudan etiket, boşluk veya desen)',
  )
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const VALUE_FLAGS = new Set(['--mode', '--surface', '--pairs'])
const CHOICES = { mode: ['light', 'dark'], pairs: ['adjacent', 'all'] }
const opts = {}
let positional = null
for (let i = 0; i < args.length; i++) {
  let a = args[i]
  let val
  const eq = a.indexOf('=')
  if (eq > 0) {
    val = a.slice(eq + 1)
    a = a.slice(0, eq)
  }
  if (VALUE_FLAGS.has(a)) opts[a.slice(2)] = val != null ? val : args[++i]
  else if (a.startsWith('--')) {
    console.error(`bilinmeyen bayrak: ${a}`)
    process.exit(2)
  } else if (positional === null) positional = a
  else {
    console.error(`beklenmeyen fazladan argüman: ${a}`)
    process.exit(2)
  }
}
for (const [k, allowed] of Object.entries(CHOICES)) {
  if (opts[k] != null && !allowed.includes(opts[k])) {
    console.error(`--${k} şunlardan biri olmalı: ${allowed.join(', ')} (gelen ${JSON.stringify(opts[k])})`)
    process.exit(2)
  }
}
const pairs = opts.pairs || 'adjacent'

let allOk = true
if (positional === null) {
  // Varsayılan: globals.css'ten oku, İKİ modu da doğrula.
  console.log(`Kaynak: ${path.relative(process.cwd(), GLOBALS_CSS).replace(/\\/g, '/')} (--chart-1..6, yüzey --card)`)
  for (const { mode, palette, surface, selector } of readFromGlobals()) {
    const result = validate(palette, { mode, surface, pairs })
    printReport(result, { mode, surface, n: palette.length, note: `${selector} · ${palette.join(' ')}` })
    if (!result.ok) allOk = false
  }
} else {
  const palette = splitColors(positional)
  const mode = opts.mode || 'light'
  const rawSurface = opts.surface != null ? stripWs(opts.surface) : ''
  const surface = rawSurface || DEFAULT_SURFACE[mode]
  const badHex = [...palette, surface].filter((c) => !isHexColor(c))
  if (badHex.length) {
    console.error(`geçersiz hex değer(ler)i: ${badHex.join(', ')} — #rrggbb bekleniyor`)
    process.exit(2)
  }
  const result = validate(palette, { mode, surface, pairs })
  printReport(result, { mode, surface, n: palette.length })
  allOk = result.ok
}

process.exit(allOk ? 0 : 1)
