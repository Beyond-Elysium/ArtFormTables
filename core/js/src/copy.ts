/**
 * --------------------------------------------------------------------------
 * Tabler copy.js
 * --------------------------------------------------------------------------
 */

import { Tooltip } from 'bootstrap'

/**
 * Constants
 */
const NAME = 'copy'
const DATA_KEY = `bs.${NAME}`

type CopyConfig = {
  timeout: number
  reset: boolean
  extend: boolean
  recopy: boolean
  feedback: 'swap' | 'tooltip'
  tooltip: string
  tooltipPlacement: string
}

const Default: CopyConfig = {
  timeout: 1500,
  reset: true,
  extend: true,
  recopy: true,
  feedback: 'swap',
  tooltip: 'Copied!',
  tooltipPlacement: 'top',
}

const Selector = {
  toggle: '[data-bs-toggle="copy"]',
  default: '[data-bs-copy-default]',
  success: '[data-bs-copy-success]',
} as const

const Event = {
  COPY: `copy.bs.${NAME}`,
  COPIED: `copied.bs.${NAME}`,
  COPYFAIL: `copyfail.bs.${NAME}`,
  RESET: `reset.bs.${NAME}`,
} as const

/**
 * Class definition
 */
class Copy {
  static NAME = NAME
  static DATA_KEY = DATA_KEY
  static Default = Default
  static Selector = Selector
  static Event = Event

  private _element: HTMLElement | null
  private _timer: number | null = null
  private _isCopied: boolean = false
  private _config: CopyConfig
  private _tooltipInstance: any = null

  constructor(element: HTMLElement, config: Partial<CopyConfig> = {}) {
    this._element = element
    this._config = { ...Default, ...this._getConfig(), ...config }
  }

  static getInstance(element?: HTMLElement | null): Copy | null {
    return (element as any)?.[DATA_KEY] ?? null
  }

  static getOrCreateInstance(element?: HTMLElement | null, config?: Partial<CopyConfig>): Copy | null {
    if (!element) return null
    ;(element as any)[DATA_KEY] ??= new Copy(element, config)
    return (element as any)[DATA_KEY]
  }

  dispose(): void {
    if (this._timer) clearTimeout(this._timer)
    this._timer = null
    this._disposeTooltip()

    if (this._element) {
      delete (this._element as any)[DATA_KEY]
    }

    this._element = null
  }

  /**
   * Public API: manual reset
   */
  reset(): void {
    if (!this._element) return
    if (!this._isCopied) return

    if (this._timer) clearTimeout(this._timer)
    this._timer = null

    this._isCopied = false
    this._applyFeedback(false)
    this._trigger(Event.RESET, { manual: true })
  }

  async copy(): Promise<boolean> {
    if (!this._element) return false

    // Already "Copied" and recopy disabled — just extend timer or noop
    if (this._isCopied && !this._config.recopy) {
      if (this._config.reset && this._config.extend) this._armResetTimer()
      return true
    }

    const text = this._getText()
    const target = this._getTarget()

    const before = this._trigger(Event.COPY, { text, target })
    if (before.defaultPrevented) return false

    if (text == null) {
      this._trigger(Event.COPYFAIL, { text: null, target, reason: 'no-text' })
      return false
    }

    const ok = await this._writeText(text)
    if (!ok) {
      this._trigger(Event.COPYFAIL, { text, target, reason: 'clipboard-failed' })
      return false
    }

    this._isCopied = true
    this._applyFeedback(true)
    this._trigger(Event.COPIED, { text, target })

    if (this._config.reset) this._armResetTimer()
    return true
  }

  private _getConfig(): Partial<CopyConfig> {
    if (!this._element) return {}

    const d = this._element.dataset
    const num = (v: string | undefined) => {
      if (v == null || v === '') return undefined
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const bool = (v: string | undefined) => (v != null ? v !== 'false' : undefined)
    const str = (v: string | undefined) => (v != null && v !== '' ? v : undefined)

    const config: Partial<CopyConfig> = {}

    const timeout = num(d.bsCopyTimeout)
    const reset = bool(d.bsCopyReset)
    const extend = bool(d.bsCopyExtend)
    const recopy = bool(d.bsCopyRecopy)
    const feedback = str(d.bsCopyFeedback)
    const tooltip = str(d.bsCopyTooltip)
    const tooltipPlacement = str(d.bsCopyTooltipPlacement)

    if (timeout !== undefined) config.timeout = timeout
    if (reset !== undefined) config.reset = reset
    if (extend !== undefined) config.extend = extend
    if (recopy !== undefined) config.recopy = recopy
    if (feedback === 'swap' || feedback === 'tooltip') config.feedback = feedback
    if (tooltip !== undefined) config.tooltip = tooltip
    if (tooltipPlacement !== undefined) config.tooltipPlacement = tooltipPlacement

    return config
  }

  private _getTarget(): Element | null {
    if (!this._element) return null
    const selector = this._element.dataset.bsCopyTarget
    return selector ? document.querySelector(selector) : null
  }

  private _getText(): string | null {
    if (!this._element) return null

    const d = this._element.dataset
    if (d.bsCopyText) return d.bsCopyText

    const target = this._getTarget()
    if (!target) return null

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target.value
    return target.textContent?.trim() ?? ''
  }

  private async _writeText(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        // ignore and fallback
      }
    }

    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  private _armResetTimer(): void {
    if (!this._element) return

    if (!this._config.extend && this._timer) return
    if (this._timer) clearTimeout(this._timer)
    this._timer = window.setTimeout(() => {
      this._isCopied = false
      this._applyFeedback(false)
      this._trigger(Event.RESET, { manual: false })
    }, this._config.timeout)
  }

  private _applyFeedback(isCopied: boolean): void {
    if (!this._element) return

    const mode = this._config.feedback

    // Tooltip mode: use Bootstrap Tooltip (manual trigger)
    if (mode === 'tooltip') {
      if (isCopied) this._showTooltip()
      else this._hideTooltip()
      return
    }

    this._swapText(isCopied)
  }

  private _swapText(isCopied: boolean): void {
    if (!this._element) return

    const def = this._element.querySelector<HTMLElement>(Selector.default)
    const success = this._element.querySelector<HTMLElement>(Selector.success)

    if (def) {
      def.hidden = isCopied
      def.classList.toggle('d-none', isCopied)
    }
    if (success) {
      success.hidden = !isCopied
      success.classList.toggle('d-none', !isCopied)
    }

    this._element.classList.toggle('is-copied', isCopied)
    if (isCopied) this._element.setAttribute('aria-label', 'Copied')
    else this._element.removeAttribute('aria-label')
  }

  private _showTooltip(): void {
    if (!this._element) return

    if (!this._tooltipInstance) {
      this._element.setAttribute('data-bs-title', this._config.tooltip)
      this._tooltipInstance = Tooltip.getOrCreateInstance(this._element, {
        trigger: 'manual',
        placement: this._config.tooltipPlacement,
      })
    } else {
      this._element.setAttribute('data-bs-title', this._config.tooltip)
      // Bootstrap 5.3+ supports setContent(); use it when available
      if (typeof this._tooltipInstance.setContent === 'function') {
        this._tooltipInstance.setContent({ '.tooltip-inner': this._config.tooltip })
      }
    }

    this._tooltipInstance.show()
  }

  private _hideTooltip(): void {
    this._tooltipInstance?.hide()
  }

  private _disposeTooltip(): void {
    if (this._tooltipInstance) {
      this._tooltipInstance.dispose()
      this._tooltipInstance = null
    }
  }

  private _trigger(type: string, detail: unknown): CustomEvent {
    if (!this._element) {
      return new CustomEvent(type, { bubbles: true, cancelable: false, detail })
    }

    const cancelable = type === Event.COPY
    const event = new CustomEvent(type, { bubbles: true, cancelable, detail })
    this._element.dispatchEvent(event)
    return event
  }
}

/**
 * Data API — click
 */
document.addEventListener('click', (e) => {
  const target = e.target as Element | null
  const trigger = target?.closest?.(Selector.toggle) as HTMLElement | null
  if (!trigger) return
  e.preventDefault()
  Copy.getOrCreateInstance(trigger)?.copy()
})

/**
 * Data API — Enter/Space
 */
document.addEventListener('keydown', (e) => {
  const ke = e as KeyboardEvent
  if (ke.key !== 'Enter' && ke.key !== ' ' && ke.key !== 'Spacebar') return

  const target = ke.target as Element | null
  const trigger = target?.closest?.(Selector.toggle) as HTMLElement | null
  if (!trigger) return

  ke.preventDefault()
  Copy.getOrCreateInstance(trigger)?.copy()
})

export default Copy
