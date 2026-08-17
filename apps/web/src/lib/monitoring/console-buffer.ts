// GitHub issue #47 / Prompt 8.3, GÖREV 2 — "Uygulama içi geri bildirim
// butonu (ekran görüntüsü + konsol logu ekli)". Bu dosya console.log/warn/
// error çağrılarını orijinal davranışlarını DEĞİŞTİRMEDEN (her zaman
// gerçek console metoduna da iletilir) bir bellek-içi halka arabelleğe
// (ring buffer) kopyalar — geri bildirim gönderildiğinde son N satır rapora
// eklenir (bkz. feedback-dialog.tsx). Sunucuya HİÇBİR ŞEY otomatik
// gönderilmez, sadece kullanıcı geri bildirim gönderdiğinde okunur.
//
// pii-scrub.ts'teki kırpma BURADA da (feedback action'ında, sunucu
// tarafında) uygulanır — konsol logları danışan objelerini yanlışlıkla
// içerebilir (bkz. o dosyanın "biri unutup client objesini loglarsa"
// gerekçesi), bu risk buradaki serbest metin için de geçerli.
const MAX_ENTRIES = 50

interface ConsoleEntry {
  level: 'log' | 'warn' | 'error'
  message: string
  timestamp: string
}

const buffer: ConsoleEntry[] = []
let installed = false

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function record(level: ConsoleEntry['level'], args: unknown[]): void {
  buffer.push({
    level,
    message: args.map(stringifyArg).join(' '),
    timestamp: new Date().toISOString(),
  })
  if (buffer.length > MAX_ENTRIES) buffer.shift()
}

// Uygulama kabuğunda (layout.tsx) BİR KEZ çağrılır — birden fazla çağrı
// konsolu ikinci kez sarmalamasın diye `installed` bayrağıyla korunuyor.
export function installConsoleBuffer(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  }

  console.log = (...args: unknown[]) => {
    record('log', args)
    original.log(...args)
  }
  console.warn = (...args: unknown[]) => {
    record('warn', args)
    original.warn(...args)
  }
  console.error = (...args: unknown[]) => {
    record('error', args)
    original.error(...args)
  }
}

export function getConsoleBufferAsText(): string {
  return buffer.map((entry) => `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`).join('\n')
}
