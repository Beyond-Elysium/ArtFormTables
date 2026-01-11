# Tabler JavaScript Tests

## How does Tabler's test suite work?

Tabler uses **Vitest** for unit testing. Each plugin has a file dedicated to its tests in `tests/unit/<plugin-name>.spec.ts`.

## Running Tests

To run the unit test suite, run:
```bash
pnpm test
```

To run tests in watch mode:
```bash
pnpm test:watch
```

To run tests with UI:
```bash
pnpm test:ui
```

To run tests with coverage:
```bash
pnpm test:coverage
```

## How do I add a new unit test?

1. Locate and open the file dedicated to the plugin which you need to add tests to (`tests/unit/<plugin-name>.spec.ts`).
2. Review the Vitest API Documentation and use the existing tests as references for how to structure your new tests.
3. Write the necessary unit test(s) for the new or revised functionality.
4. Run `pnpm test` to see the results of your newly-added test(s).

**Note:** Your new unit tests should fail before your changes are applied to the plugin, and should pass after your changes are applied to the plugin.

## What should a unit test look like?

- Each test should have a unique name clearly stating what unit is being tested.
- Each test should be in the corresponding `describe` block.
- Each test should test only one unit per test, although one test can include several assertions. Create multiple tests for multiple units of functionality.
- Each test should use `expect` to ensure something is expected.
- Each test should follow the project's JavaScript Code Guidelines.

## Code Coverage

We're aiming for at least 90% test coverage for our code. To ensure your changes meet or exceed this limit, run:

```bash
pnpm test:coverage
```

This will generate coverage reports in multiple formats:
- **Text**: Displayed in terminal
- **HTML**: Open `coverage/index.html` in your browser for detailed coverage report
- **JSON**: `coverage/coverage-final.json` for programmatic access
- **LCOV**: `coverage/lcov.info` for CI/CD integration

### Coverage Thresholds

The following thresholds are enforced (minimum 90%):
- Lines: 90%
- Functions: 90%
- Branches: 90%
- Statements: 90%

If coverage falls below these thresholds, tests will fail.

## Test Structure

Tests follow Bootstrap's test structure pattern:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import PluginName from '../../src/plugin-name'
import { getFixture, clearFixture } from '../helpers/fixture'

describe('PluginName', () => {
  let fixtureEl: HTMLDivElement

  beforeEach(() => {
    fixtureEl = getFixture()
    clearFixture()
  })

  describe('getInstance', () => {
    it('should return null if there is no instance', () => {
      fixtureEl.innerHTML = '<div></div>'
      const divEl = fixtureEl.querySelector('div') as HTMLElement

      expect(PluginName.getInstance(divEl)).toBeNull()
    })
  })
})
```

## Example Tests

### Synchronous test

```typescript
describe('getInstance', () => {
  it('should return null if there is no instance', () => {
    fixtureEl.innerHTML = '<div></div>'
    const divEl = fixtureEl.querySelector('div') as HTMLElement

    expect(PluginName.getInstance(divEl)).toBeNull()
  })

  it('should return this instance', () => {
    fixtureEl.innerHTML = '<div></div>'
    const divEl = fixtureEl.querySelector('div') as HTMLElement
    const instance = new PluginName(divEl)

    expect(PluginName.getInstance(divEl)).toEqual(instance)
  })
})
```

### Asynchronous test

```typescript
it('should show a tooltip without the animation', async () => {
  fixtureEl.innerHTML = '<a href="#" rel="tooltip" title="Another tooltip"></a>'
  const tooltipEl = fixtureEl.querySelector('a') as HTMLElement
  const tooltip = new Tooltip(tooltipEl, {
    animation: false
  })

  const promise = new Promise<void>((resolve) => {
    tooltipEl.addEventListener('shown.bs.tooltip', () => {
      const tip = document.querySelector('.tooltip')

      expect(tip).not.toBeNull()
      expect(tip?.classList.contains('fade')).toBe(false)
      resolve()
    })
  })

  tooltip.show()
  await promise
})
```

## Fixture Helper

Use the fixture helper to manage test DOM elements:

```typescript
import { getFixture, clearFixture } from '../helpers/fixture'

describe('MyPlugin', () => {
  let fixtureEl: HTMLDivElement

  beforeEach(() => {
    fixtureEl = getFixture()
    clearFixture()
  })

  it('should work', () => {
    fixtureEl.innerHTML = '<div class="test"></div>'
    const divEl = fixtureEl.querySelector('div') as HTMLElement
    
    // Your test code here
  })
})
```
