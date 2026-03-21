import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import sassTrue from 'sass-true'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testsDir = path.join(__dirname)

/**
 * Discovers and runs all .test.scss files via sass-true.
 * SCSS tests use describe/it from Vitest, integrated through sass-true's runSass.
 */
function discoverScssTests(dir: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...discoverScssTests(fullPath))
    } else if (entry.name.endsWith('.test.scss')) {
      files.push(fullPath)
    }
  }
  return files
}

const testFiles = discoverScssTests(testsDir)
const scssRoot = path.join(__dirname, '..')

for (const filePath of testFiles) {
  const content = fs.readFileSync(filePath, 'utf8')
  const TRUE_SETUP = '$true-terminal-output: false; @import "true";'
  const sassString = TRUE_SETUP + '\n' + content

  sassTrue.runSass(
    { describe, it, sourceType: 'string' },
    sassString,
    {
      loadPaths: [path.dirname(filePath), scssRoot, path.join(__dirname, '../../node_modules')]
    }
  )
}
