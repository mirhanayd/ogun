export type CommandShortcutTarget = () => boolean

type ShortcutEventTarget = {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void
}

const mountedTargets = new Set<CommandShortcutTarget>()
let removeListener: (() => void) | null = null

export function dispatchCommandShortcut(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'key' | 'preventDefault'>,
  targets: Iterable<CommandShortcutTarget>,
): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return false
  for (const target of targets) {
    if (!target()) continue
    event.preventDefault()
    return true
  }
  return false
}

export function registerCommandShortcutTarget(
  target: CommandShortcutTarget,
  eventTarget: ShortcutEventTarget = document,
): () => void {
  mountedTargets.add(target)
  if (!removeListener) {
    const listener = (event: KeyboardEvent) => {
      dispatchCommandShortcut(event, mountedTargets)
    }
    eventTarget.addEventListener('keydown', listener)
    removeListener = () => eventTarget.removeEventListener('keydown', listener)
  }

  return () => {
    mountedTargets.delete(target)
    if (mountedTargets.size === 0 && removeListener) {
      removeListener()
      removeListener = null
    }
  }
}
