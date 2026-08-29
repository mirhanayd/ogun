import { Leaf } from 'lucide-react'

/**
 * Native composition lives with the web UI so desktop cannot own a second
 * visual application. Shared domain screens and the Ogun shell mount here.
 */
export function DesktopApp() {
  return (
    <main className="grid min-h-svh place-items-center bg-background text-foreground">
      <div className="flex items-center gap-3 text-primary" role="status">
        <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Leaf className="size-5" />
        </span>
        <span className="text-lg font-semibold">Öğün çalışma alanı açılıyor…</span>
      </div>
    </main>
  )
}
