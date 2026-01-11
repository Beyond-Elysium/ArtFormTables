// Global type declarations for window properties

interface Window {
  autosize?: (element: HTMLElement | HTMLTextAreaElement) => void
  countUp?: {
    CountUp: new (target: HTMLElement, endVal: number, options?: any) => {
      error: boolean
      start: () => void
    }
  }
  IMask?: new (element: HTMLElement, options: { mask: string; lazy?: boolean }) => any
  Sortable?: new (element: HTMLElement, options?: any) => any
  Tabler?: {
    setTheme: (value: string) => void
    setPrimary: (value: string) => void
    setBase: (value: string) => void
    setFont: (value: string) => void
    setRadius: (value: string) => void
    reset: () => void
    getConfig: () => {
      theme: string
      'theme-base': string
      'theme-font': string
      'theme-primary': string
      'theme-radius': string
    }
  }
}

