import autosize from 'autosize'

/**
 * --------------------------------------------------------------------------
 * Tabler autosize.js
 * --------------------------------------------------------------------------
 */

/**
 * Constants
 */

const NAME = 'autosize'
const DATA_KEY = `tblr.${NAME}`

const SELECTOR_DATA_AUTOSIZE = '[data-bs-autosize]'

/**
 * Class definition
 */

class Autosize {
  private element: HTMLElement | HTMLTextAreaElement
  private initialized: boolean = false

  constructor(element: HTMLElement | HTMLTextAreaElement) {
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
   * Initialize autosize on the element
   */
  init(): void {
    if (this.initialized) {
      return
    }

    autosize(this.element)
    this.initialized = true
  }

  /**
   * Update autosize (useful when content changes programmatically)
   */
  update(): void {
    if (!this.initialized) {
      return
    }

    autosize.update(this.element)
  }

  /**
   * Destroy autosize instance
   */
  dispose(): void {
    if (!this.initialized) {
      return
    }

    autosize.destroy(this.element)
    this.initialized = false
  }

  // Static
  /**
   * Get instance from element
   */
  static getInstance(element: HTMLElement | HTMLTextAreaElement): Autosize | null {
    return elementMap.get(element) || null
  }

  /**
   * Get or create instance
   */
  static getOrCreateInstance(element: HTMLElement | HTMLTextAreaElement): Autosize {
    return this.getInstance(element) || new this(element)
  }
}

/**
 * Instance storage
 */
const elementMap = new WeakMap<HTMLElement | HTMLTextAreaElement, Autosize>()

/**
 * Data API implementation
 */
const autosizeTriggerList: HTMLElement[] = [].slice.call(document.querySelectorAll<HTMLElement>(SELECTOR_DATA_AUTOSIZE))
autosizeTriggerList.map(function (autosizeTriggerEl: HTMLElement) {
  const instance = Autosize.getOrCreateInstance(autosizeTriggerEl)
  elementMap.set(autosizeTriggerEl, instance)
  instance.init()
  return instance
})

export default Autosize
