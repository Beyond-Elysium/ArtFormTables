/**
 * Test fixture helper
 * Similar to Bootstrap's fixtureEl pattern
 */

let fixtureContainer: HTMLDivElement | null = null

/**
 * Get or create fixture container
 */
export function getFixture(): HTMLDivElement {
  if (!fixtureContainer) {
    fixtureContainer = document.createElement('div')
    fixtureContainer.id = 'test-fixture'
    document.body.appendChild(fixtureContainer)
  }
  return fixtureContainer
}

/**
 * Clear fixture container
 */
export function clearFixture(): void {
  const fixture = getFixture()
  fixture.innerHTML = ''
}

/**
 * Remove fixture container
 */
export function removeFixture(): void {
  if (fixtureContainer && fixtureContainer.parentNode) {
    fixtureContainer.parentNode.removeChild(fixtureContainer)
    fixtureContainer = null
  }
}
