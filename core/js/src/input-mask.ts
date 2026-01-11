import IMask, { type InputMask as IMaskInputMask } from 'imask'

/**
 * --------------------------------------------------------------------------
 * Tabler input-mask.js
 * --------------------------------------------------------------------------
 */

/**
 * Constants
 */

const NAME = 'input-mask'
const DATA_KEY = `tblr.${NAME}`

const SELECTOR_DATA_MASK = '[data-mask]'

/**
 * Class definition
 */

class InputMask {
  private element: HTMLElement | HTMLInputElement
  private maskInstance: IMaskInputMask<any> | null = null
  private initialized: boolean = false
  private options: Record<string, any> = {}

  constructor(element: HTMLElement | HTMLInputElement) {
    this.element = element
  }

  // Getters
  static get NAME() {
    return NAME
  }

  static get DATA_KEY() {
    return DATA_KEY
  }

  // Public
  /**
   * Initialize input mask on the element
   */
  init(): void {
    if (this.initialized) {
      return
    }

    const mask = this.element.getAttribute('data-mask')
    if (!mask) {
      return
    }

    const options: Record<string, any> = {
      mask: mask,
      lazy: this.element.getAttribute('data-mask-visible') === 'true',
    }

    this.options = options

    this.maskInstance = IMask(this.element, options)
    this.initialized = true
  }

  /**
   * Update input mask (useful when mask changes programmatically)
   */
  update(mask?: string, options?: Partial<Record<string, any>>): void {
    if (!this.initialized || !this.maskInstance) {
      return
    }

    const newOptions: Record<string, any> = {
      ...this.options,
      ...options,
    }

    if (mask) {
      newOptions.mask = mask
    }

    this.maskInstance.updateOptions(newOptions)
  }

  /**
   * Get the current masked value
   */
  getValue(): string {
    if (!this.initialized || !this.maskInstance) {
      return ''
    }

    return this.maskInstance.value
  }

  /**
   * Get the current unmasked value
   */
  getUnmaskedValue(): string {
    if (!this.initialized || !this.maskInstance) {
      return ''
    }

    return this.maskInstance.unmaskedValue
  }

  /**
   * Destroy input mask instance
   */
  dispose(): void {
    if (!this.initialized || !this.maskInstance) {
      return
    }

    this.maskInstance.destroy()
    this.maskInstance = null
    this.initialized = false
  }

  // Static
  /**
   * Get instance from element
   */
  static getInstance(element: HTMLElement | HTMLInputElement): InputMask | null {
    return elementMap.get(element) || null
  }

  /**
   * Get or create instance
   */
  static getOrCreateInstance(element: HTMLElement | HTMLInputElement): InputMask {
    return this.getInstance(element) || new this(element)
  }
}

/**
 * Instance storage
 */
const elementMap = new WeakMap<HTMLElement | HTMLInputElement, InputMask>()

/**
 * Data API implementation
 */
const inputMaskTriggerList: HTMLElement[] = [].slice.call(document.querySelectorAll<HTMLElement>(SELECTOR_DATA_MASK))
inputMaskTriggerList.map(function (inputMaskTriggerEl: HTMLElement) {
  const instance = InputMask.getOrCreateInstance(inputMaskTriggerEl)
  elementMap.set(inputMaskTriggerEl, instance)
  instance.init()
  return instance
})

export default InputMask
