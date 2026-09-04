import { describe, expect, it, vi } from 'vitest'
import { dispatchCommandShortcut, registerCommandShortcutTarget } from './command-shortcut'

describe('shared command shortcut dispatch', () => {
  it('opens only the first visible mounted search target', () => {
    const preventDefault = vi.fn()
    const hidden = vi.fn(() => false)
    const visible = vi.fn(() => true)
    const duplicate = vi.fn(() => true)
    expect(
      dispatchCommandShortcut(
        { ctrlKey: true, metaKey: false, key: 'k', preventDefault },
        [hidden, visible, duplicate],
      ),
    ).toBe(true)
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(hidden).toHaveBeenCalledOnce()
    expect(visible).toHaveBeenCalledOnce()
    expect(duplicate).not.toHaveBeenCalled()
  })

  it('ignores unrelated keyboard input', () => {
    expect(
      dispatchCommandShortcut(
        { ctrlKey: false, metaKey: false, key: 'k', preventDefault: vi.fn() },
        [],
      ),
    ).toBe(false)
  })

  it('shares one keydown listener across mounted search bars', () => {
    const listeners = new Set<(event: KeyboardEvent) => void>()
    const eventTarget = {
      addEventListener: vi.fn((_type: 'keydown', listener: (event: KeyboardEvent) => void) => {
        listeners.add(listener)
      }),
      removeEventListener: vi.fn((_type: 'keydown', listener: (event: KeyboardEvent) => void) => {
        listeners.delete(listener)
      }),
    }
    const disposeFirst = registerCommandShortcutTarget(() => true, eventTarget)
    const disposeSecond = registerCommandShortcutTarget(() => false, eventTarget)

    expect(eventTarget.addEventListener).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(1)

    disposeFirst()
    expect(eventTarget.removeEventListener).not.toHaveBeenCalled()
    disposeSecond()
    expect(eventTarget.removeEventListener).toHaveBeenCalledTimes(1)
    expect(listeners.size).toBe(0)
  })
})
