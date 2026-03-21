import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
   test: {
      globals: true,
      css: false,
      forceRerunTriggers: ['**/*.scss'],
      coverage: {
         provider: 'istanbul',
         include: ['js/src/bootstrap/**/*.ts'],
         reporter: ['text', 'html', 'lcov'],
         reportsDirectory: 'coverage'
      },
      projects: [
         {
            extends: true,
            test: {
               name: 'js',
               include: ['js/tests/**/*.spec.ts'],
               browser: {
                  enabled: true,
                  provider: playwright(),
                  headless: true,
                  instances: [{ browser: 'chromium' }]
               }
            }
         },
         {
            extends: true,
            test: {
               name: 'scss',
               include: ['scss/tests/**/*.spec.ts'],
               environment: 'node'
            }
         }
      ]
   }
})
