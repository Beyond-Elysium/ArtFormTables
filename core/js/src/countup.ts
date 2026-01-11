import { CountUp } from 'countup.js'

/**
 * --------------------------------------------------------------------------
 * Tabler countup.js
 * --------------------------------------------------------------------------
 */

/**
 * Constants
 */

const NAME = 'countup'
const DATA_KEY = `tblr.${NAME}`

const SELECTOR_DATA_COUNTUP = '[data-countup]'

/**
 * Class definition
 */

class Countup {
  private element: HTMLElement
  private countUpInstance: CountUp | null = null
  private initialized: boolean = false
  private options: Record<string, any> = {}

  constructor(element: HTMLElement) {
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
   * Initialize countup on the element
   */
  init(): void {
    if (this.initialized) {
      return
    }

    // Parse options from data attribute
    let options: Record<string, any> = {}
    try {
      const dataOptions = this.element.getAttribute('data-countup') ? JSON.parse(this.element.getAttribute('data-countup')!) : {}
      options = Object.assign(
        {
          enableScrollSpy: true,
        },
        dataOptions,
      )
    } catch (error) {
      // ignore invalid JSON
    }

    this.options = options

    const value = parseInt(this.element.innerHTML, 10)

    if (!isNaN(value)) {
      this.countUpInstance = new CountUp(this.element, value, options)
      if (!this.countUpInstance.error) {
        this.countUpInstance.start()
        this.initialized = true
      }
    }
  }

  /**
   * Update countup (restart animation)
   */
  update(): void {
    if (!this.initialized || !this.countUpInstance) {
      return
    }

    const value = parseInt(this.element.innerHTML, 10)
    if (!isNaN(value)) {
      this.countUpInstance = new CountUp(this.element, value, this.options)
      if (!this.countUpInstance.error) {
        this.countUpInstance.start()
      }
    }
  }

  /**
   * Destroy countup instance
   */
  dispose(): void {
    if (!this.initialized) {
      return
    }

    // CountUp doesn't have a destroy method, so we just reset state
    this.countUpInstance = null
    this.initialized = false
  }

  // Static
  /**
   * Get instance from element
   */
  static getInstance(element: HTMLElement): Countup | null {
    return elementMap.get(element) || null
  }

  /**
   * Get or create instance
   */
  static getOrCreateInstance(element: HTMLElement): Countup {
    return this.getInstance(element) || new this(element)
  }
}

/**
 * Instance storage
 */
const elementMap = new WeakMap<HTMLElement, Countup>()

/**
 * Data API implementation
 */
const countupTriggerList: HTMLElement[] = [].slice.call(document.querySelectorAll<HTMLElement>(SELECTOR_DATA_COUNTUP))
countupTriggerList.map(function (countupTriggerEl: HTMLElement) {
  const instance = Countup.getOrCreateInstance(countupTriggerEl)
  elementMap.set(countupTriggerEl, instance)
  instance.init()
  return instance
})

export default Countup
