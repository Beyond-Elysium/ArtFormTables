import { afterEach } from 'vitest'
import { clearFixture } from './fixture'

/**
 * Setup file for Vitest tests
 * This file runs before each test file
 * 
 * Note: jsdom automatically cleans up the DOM between tests,
 * but we clear fixture for consistency with Bootstrap's test pattern
 */
afterEach(() => {
  clearFixture()
})
