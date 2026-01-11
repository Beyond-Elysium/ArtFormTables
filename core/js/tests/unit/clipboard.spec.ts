import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Tooltip } from 'bootstrap'
import Copy from '../../src/copy'
import { getFixture, clearFixture } from '../helpers/fixture'

describe('Copy', () => {
  let fixtureEl: HTMLDivElement
  let clipboardWriteText: ReturnType<typeof vi.fn>
  let originalClipboardDescriptor: PropertyDescriptor | undefined
  let originalExecCommand: any

  const setNavigatorClipboard = (writeTextImpl: (text: string) => Promise<void>) => {
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextImpl },
      configurable: true,
    })
  }

  beforeEach(() => {
    fixtureEl = getFixture()
    clearFixture()

    clipboardWriteText = vi.fn().mockResolvedValue(undefined)
    setNavigatorClipboard(clipboardWriteText)

    originalExecCommand = (document as any).execCommand
    ;(document as any).execCommand = vi.fn().mockReturnValue(false)

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()

    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (navigator as any).clipboard
    }

    ;(document as any).execCommand = originalExecCommand
  })

  describe('getInstance / getOrCreateInstance', () => {
    it('should return null when instance does not exist', () => {
      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="x"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      expect(Copy.getInstance(buttonEl)).toBeNull()
    })

    it('should create and store instance on element', () => {
      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="x"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const instance1 = Copy.getOrCreateInstance(buttonEl)
      expect(instance1).toBeInstanceOf(Copy)
      expect(Copy.getInstance(buttonEl)).toBe(instance1)

      const instance2 = Copy.getOrCreateInstance(buttonEl)
      expect(instance2).toBe(instance1)
    })

    it('dispose should remove stored instance', () => {
      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="x"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const instance = Copy.getOrCreateInstance(buttonEl)!
      expect(Copy.getInstance(buttonEl)).toBe(instance)

      instance.dispose()
      expect(Copy.getInstance(buttonEl)).toBeNull()
    })
  })

  describe('copy()', () => {
    it('should copy text from data-bs-copy-text and set copied state', async () => {
      fixtureEl.innerHTML = `
        <button data-bs-toggle="copy" data-bs-copy-text="hello">
          <span data-bs-copy-default>Default</span>
          <span data-bs-copy-success hidden>Success</span>
        </button>
      `
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement
      const def = buttonEl.querySelector('[data-bs-copy-default]') as HTMLElement
      const success = buttonEl.querySelector('[data-bs-copy-success]') as HTMLElement

      const instance = Copy.getOrCreateInstance(buttonEl)!
      const ok = await instance.copy()

      expect(ok).toBe(true)
      expect(clipboardWriteText).toHaveBeenCalledWith('hello')
      expect(buttonEl.classList.contains('is-copied')).toBe(true)
      expect(buttonEl.getAttribute('aria-label')).toBe('Copied')
      expect(def.hidden).toBe(true)
      expect(success.hidden).toBe(false)
    })

    it('should fire cancelable COPY event and respect preventDefault()', async () => {
      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="hello"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      buttonEl.addEventListener(Copy.Event.COPY, (e) => e.preventDefault())

      const instance = Copy.getOrCreateInstance(buttonEl)!
      const ok = await instance.copy()

      expect(ok).toBe(false)
      expect(clipboardWriteText).not.toHaveBeenCalled()
    })

    it('should emit COPYFAIL when there is no text', async () => {
      fixtureEl.innerHTML = '<button data-bs-toggle="copy"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const onFail = vi.fn()
      buttonEl.addEventListener(Copy.Event.COPYFAIL, onFail as any)

      const instance = Copy.getOrCreateInstance(buttonEl)!
      const ok = await instance.copy()

      expect(ok).toBe(false)
      expect(onFail).toHaveBeenCalledTimes(1)
      const ev = onFail.mock.calls[0][0] as CustomEvent
      expect(ev.detail.reason).toBe('no-text')
    })

    it('should emit COPYFAIL when clipboard write fails', async () => {
      clipboardWriteText.mockRejectedValueOnce(new Error('nope'))

      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="hello"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const onFail = vi.fn()
      buttonEl.addEventListener(Copy.Event.COPYFAIL, onFail as any)

      const instance = Copy.getOrCreateInstance(buttonEl)!
      const ok = await instance.copy()

      expect(ok).toBe(false)
      expect(onFail).toHaveBeenCalledTimes(1)
      const ev = onFail.mock.calls[0][0] as CustomEvent
      expect(ev.detail.reason).toBe('clipboard-failed')
    })

    it('should reset automatically after timeout when reset=true', async () => {
      vi.useFakeTimers()

      fixtureEl.innerHTML = `
        <button data-bs-toggle="copy" data-bs-copy-text="hello">
          <span data-bs-copy-default>Default</span>
          <span data-bs-copy-success hidden>Success</span>
        </button>
      `
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement
      const def = buttonEl.querySelector('[data-bs-copy-default]') as HTMLElement
      const success = buttonEl.querySelector('[data-bs-copy-success]') as HTMLElement

      const instance = Copy.getOrCreateInstance(buttonEl, { timeout: 1000 })!
      await instance.copy()

      expect(buttonEl.classList.contains('is-copied')).toBe(true)

      vi.advanceTimersByTime(999)
      expect(buttonEl.classList.contains('is-copied')).toBe(true)

      vi.advanceTimersByTime(1)
      expect(buttonEl.classList.contains('is-copied')).toBe(false)
      expect(buttonEl.getAttribute('aria-label')).toBeNull()
      expect(def.hidden).toBe(false)
      expect(success.hidden).toBe(true)
    })

    it('should extend timeout without recopy when recopy=false and extend=true', async () => {
      vi.useFakeTimers()

      fixtureEl.innerHTML = `
        <button data-bs-toggle="copy" data-bs-copy-text="hello">
          <span data-bs-copy-default>Default</span>
          <span data-bs-copy-success hidden>Success</span>
        </button>
      `
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const instance = Copy.getOrCreateInstance(buttonEl, { timeout: 1000, recopy: false, extend: true, reset: true })!

      await instance.copy()
      expect(clipboardWriteText).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(500)
      await instance.copy()
      expect(clipboardWriteText).toHaveBeenCalledTimes(1)

      // 600ms after the second click: should still be copied (timer extended)
      vi.advanceTimersByTime(600)
      expect(buttonEl.classList.contains('is-copied')).toBe(true)

      // 401ms more (total 1001ms after second click): should reset
      vi.advanceTimersByTime(401)
      expect(buttonEl.classList.contains('is-copied')).toBe(false)
    })

    it('should recopy when recopy=true (default)', async () => {
      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="hello"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement
      const instance = Copy.getOrCreateInstance(buttonEl, { reset: false })!

      await instance.copy()
      await instance.copy()

      expect(clipboardWriteText).toHaveBeenCalledTimes(2)
    })

    it('should not extend timeout when extend=false and timer is already running', async () => {
      vi.useFakeTimers()

      fixtureEl.innerHTML = `
        <button data-bs-toggle="copy" data-bs-copy-text="hello">
          <span data-bs-copy-default>Default</span>
          <span data-bs-copy-success hidden>Success</span>
        </button>
      `
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const instance = Copy.getOrCreateInstance(buttonEl, { timeout: 1000, recopy: false, extend: false, reset: true })!

      await instance.copy()
      vi.advanceTimersByTime(500)
      await instance.copy() // should NOT extend existing timer

      vi.advanceTimersByTime(501) // total 1001ms from first copy
      expect(buttonEl.classList.contains('is-copied')).toBe(false)
    })
  })

  describe('reset()', () => {
    it('should manually reset and emit RESET with manual=true', async () => {
      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="hello"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const onReset = vi.fn()
      buttonEl.addEventListener(Copy.Event.RESET, onReset as any)

      const instance = Copy.getOrCreateInstance(buttonEl, { reset: false })!
      await instance.copy()

      expect(buttonEl.classList.contains('is-copied')).toBe(true)

      instance.reset()
      expect(buttonEl.classList.contains('is-copied')).toBe(false)
      expect(onReset).toHaveBeenCalledTimes(1)
      const ev = onReset.mock.calls[0][0] as CustomEvent
      expect(ev.detail.manual).toBe(true)
    })
  })

  describe('Data API', () => {
    it('should copy on click via document listener', async () => {
      fixtureEl.innerHTML = `
        <button data-bs-toggle="copy" data-bs-copy-text="hello">
          <span data-bs-copy-default>Default</span>
        </button>
      `
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement
      const span = buttonEl.querySelector('span') as HTMLElement

      span.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // allow async copy() chain to complete (Data API doesn't await)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(clipboardWriteText).toHaveBeenCalledWith('hello')
      expect(buttonEl.classList.contains('is-copied')).toBe(true)
    })
  })

  describe('feedback: tooltip', () => {
    it('should show/hide bootstrap tooltip when available', async () => {
      vi.useFakeTimers()

      const show = vi.fn()
      const hide = vi.fn()
      const dispose = vi.fn()
      const getOrCreateInstance = vi.spyOn(Tooltip, 'getOrCreateInstance').mockReturnValue({ show, hide, dispose } as any)

      fixtureEl.innerHTML = '<button data-bs-toggle="copy" data-bs-copy-text="hello"></button>'
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const instance = Copy.getOrCreateInstance(buttonEl, {
        feedback: 'tooltip',
        tooltip: 'Copied!',
        tooltipPlacement: 'top',
        timeout: 500,
        reset: true,
      })!

      await instance.copy()
      expect(getOrCreateInstance).toHaveBeenCalledTimes(1)
      expect(show).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(500)
      expect(hide).toHaveBeenCalledTimes(1)

      instance.dispose()
      expect(dispose).toHaveBeenCalledTimes(1)
      getOrCreateInstance.mockRestore()
    })

    it('should not swap when tooltip mode is enabled', async () => {
      fixtureEl.innerHTML = `
        <button data-bs-toggle="copy" data-bs-copy-text="hello">
          <span data-bs-copy-default>Default</span>
          <span data-bs-copy-success hidden>Success</span>
        </button>
      `
      const buttonEl = fixtureEl.querySelector('button') as HTMLElement

      const show = vi.fn()
      const hide = vi.fn()
      const dispose = vi.fn()
      const getOrCreateInstance = vi.spyOn(Tooltip, 'getOrCreateInstance').mockReturnValue({ show, hide, dispose } as any)

      const instance = Copy.getOrCreateInstance(buttonEl, { feedback: 'tooltip', reset: false })!
      await instance.copy()

      // tooltip mode uses Tooltip feedback and does not rely on swap markup
      expect(show).toHaveBeenCalledTimes(1)
      expect(buttonEl.classList.contains('is-copied')).toBe(false)

      instance.dispose()
      getOrCreateInstance.mockRestore()
    })
  })

  describe('static properties', () => {
    it('should have correct NAME', () => {
      expect(Copy.NAME).toBe('copy')
    })

    it('should have correct DATA_KEY', () => {
      expect(Copy.DATA_KEY).toBe('bs.copy')
    })
  })
})
