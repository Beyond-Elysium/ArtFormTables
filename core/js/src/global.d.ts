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
}

declare module 'shiki/bundle/web' {
  export const createHighlighter: (options: {
    langs: string[]
    themes: string[]
  }) => Promise<{
    codeToHtml: (code: string, options: { lang: string; theme: string }) => string
  }>
}

