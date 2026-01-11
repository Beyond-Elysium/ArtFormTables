/**
 * --------------------------------------------------------------------------
 * Tabler switch-icon.js
 * --------------------------------------------------------------------------
 */

/**
 * Constants
 */

const NAME = 'switch-icon'
const DATA_KEY = `tblr.${NAME}`

const CLASS_NAME_ACTIVE = 'active'

const SELECTOR_DATA_TOGGLE = '[data-bs-toggle="switch-icon"]'

/**
 * Class definition
 */

class SwitchIcon {
  private element: HTMLElement
  private initialized: boolean = false

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
   * Initialize switch-icon on the element
   */
  init(): void {
    if (this.initialized) {
      return
    }

    this._setListeners()
    this.initialized = true
  }

  /**
   * Toggle active state
   */
  toggle(): void {
    this.element.classList.toggle(CLASS_NAME_ACTIVE)
  }

  /**
   * Show (activate) switch-icon
   */
  show(): void {
    this.element.classList.add(CLASS_NAME_ACTIVE)
  }

  /**
   * Hide (deactivate) switch-icon
   */
  hide(): void {
    this.element.classList.remove(CLASS_NAME_ACTIVE)
  }

  /**
   * Check if switch-icon is active
   */
  isActive(): boolean {
    return this.element.classList.contains(CLASS_NAME_ACTIVE)
  }

  /**
   * Destroy switch-icon instance
   */
  dispose(): void {
    if (!this.initialized) {
      return
    }

    this._removeListeners()
    this.initialized = false
  }

  // Private
  /**
   * Set event listeners
   */
  private _setListeners(): void {
    this.element.addEventListener('click', this._handleClick)
  }

  /**
   * Remove event listeners
   */
  private _removeListeners(): void {
    this.element.removeEventListener('click', this._handleClick)
  }

  /**
   * Handle click event
   */
  private _handleClick = (e: MouseEvent): void => {
    e.stopPropagation()
    this.toggle()
  }

  // Static
  /**
   * Get instance from element
   */
  static getInstance(element: HTMLElement): SwitchIcon | null {
    return elementMap.get(element) || null
  }

  /**
   * Get or create instance
   */
  static getOrCreateInstance(element: HTMLElement): SwitchIcon {
    return this.getInstance(element) || new this(element)
  }
}

/**
 * Instance storage
 */
const elementMap = new WeakMap<HTMLElement, SwitchIcon>()

/**
 * Data API implementation
 */
const switchIconTriggerList: HTMLElement[] = [].slice.call(document.querySelectorAll<HTMLElement>(SELECTOR_DATA_TOGGLE))
switchIconTriggerList.map(function (switchIconTriggerEl: HTMLElement) {
  const instance = SwitchIcon.getOrCreateInstance(switchIconTriggerEl)
  elementMap.set(switchIconTriggerEl, instance)
  instance.init()
  return instance
})

export default SwitchIcon
