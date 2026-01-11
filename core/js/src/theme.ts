/**
 * --------------------------------------------------------------------------
 * Tabler theme.js
 * --------------------------------------------------------------------------
 */

/**
 * Constants
 */

const NAME = 'theme'
const DATA_KEY = `tblr.${NAME}`

interface ThemeConfig {
  'theme': string
  'theme-base': string
  'theme-font': string
  'theme-primary': string
  'theme-radius': string
}

const DEFAULT_THEME_CONFIG: ThemeConfig = {
  'theme': 'light',
  'theme-base': 'gray',
  'theme-font': 'sans-serif',
  'theme-primary': 'blue',
  'theme-radius': '1',
}

/**
 * Class definition
 */

class Theme {
  private initialized: boolean = false
  private config: ThemeConfig

  constructor(config?: Partial<ThemeConfig>) {
    this.config = { ...DEFAULT_THEME_CONFIG, ...config }
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
   * Initialize theme
   */
  init(): void {
    if (this.initialized) {
      return
    }

    this._applyTheme()
    this.initialized = true
  }

  /**
   * Update theme configuration
   */
  update(config: Partial<ThemeConfig>): void {
    this.config = { ...this.config, ...config }
    this._applyTheme()
  }

  /**
   * Set theme (light/dark)
   */
  setTheme(value: string): void {
    this.update({ theme: value })
    this._updateURL('theme', value)
  }

  /**
   * Set primary color
   */
  setPrimary(value: string): void {
    this.update({ 'theme-primary': value })
    this._updateURL('theme-primary', value)
  }

  /**
   * Set theme base
   */
  setBase(value: string): void {
    this.update({ 'theme-base': value })
    this._updateURL('theme-base', value)
  }

  /**
   * Set font family
   */
  setFont(value: string): void {
    this.update({ 'theme-font': value })
    this._updateURL('theme-font', value)
  }

  /**
   * Set border radius
   */
  setRadius(value: string): void {
    this.update({ 'theme-radius': value })
    this._updateURL('theme-radius', value)
  }

  /**
   * Reset all theme settings to default
   */
  reset(): void {
    this.config = { ...DEFAULT_THEME_CONFIG }
    this._applyTheme()
    
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      for (const key in DEFAULT_THEME_CONFIG) {
        url.searchParams.delete(key)
        localStorage.removeItem('tabler-' + key)
      }
      window.history.pushState({}, '', url)
    }
  }

  /**
   * Get current theme configuration
   */
  getConfig(): ThemeConfig {
    const config: ThemeConfig = { ...DEFAULT_THEME_CONFIG }
    
    if (typeof window !== 'undefined') {
      for (const key in DEFAULT_THEME_CONFIG) {
        const stored = localStorage.getItem('tabler-' + key)
        if (stored) {
          config[key as keyof ThemeConfig] = stored
        }
      }
    }
    
    return config
  }

  /**
   * Dispose theme instance
   */
  dispose(): void {
    if (!this.initialized) {
      return
    }

    this.initialized = false
  }

  // Private
  /**
   * Update URL with theme parameter
   */
  private _updateURL(key: string, value: string): void {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (value === DEFAULT_THEME_CONFIG[key as keyof ThemeConfig]) {
        url.searchParams.delete(key)
      } else {
        url.searchParams.set(key, value)
      }
      window.history.pushState({}, '', url)
    }
  }

  /**
   * Apply theme to document
   */
  private _applyTheme(): void {
    const params = new Proxy(new URLSearchParams(window.location.search), {
      get: (searchParams: URLSearchParams, prop: string): string | null => searchParams.get(prop),
    })

    for (const key in this.config) {
      const param = params[key]
      let selectedValue: string

      if (!!param) {
        localStorage.setItem('tabler-' + key, param)
        selectedValue = param
      } else {
        const storedTheme = localStorage.getItem('tabler-' + key)
        selectedValue = storedTheme ? storedTheme : this.config[key as keyof ThemeConfig]
      }

      if (selectedValue !== this.config[key as keyof ThemeConfig]) {
        document.documentElement.setAttribute('data-bs-' + key, selectedValue)
      } else {
        document.documentElement.removeAttribute('data-bs-' + key)
      }
    }
  }

  // Static
  /**
   * Get or create instance
   */
  static getOrCreateInstance(config?: Partial<ThemeConfig>): Theme {
    if (!Theme.instance) {
      Theme.instance = new Theme(config)
    }
    return Theme.instance
  }

  private static instance: Theme | null = null
}

/**
 * Data API implementation
 */
const theme = Theme.getOrCreateInstance()
theme.init()

export default Theme
