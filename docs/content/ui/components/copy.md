---
title: Copy
summary: Quickly copy text to the clipboard with UI feedback.
description: Use Copy to copy text to the clipboard and provide instant UI feedback via swap or tooltip.
---

Use the **Copy** plugin to quickly copy text to the clipboard and provide instant UI feedback (**swap** or **tooltip**).

## How it works

Copy is a small JavaScript plugin that:

- listens for **Data API** triggers (`data-bs-toggle="copy"`)
- reads the text to copy from:
  - `data-bs-copy-text` **or**
  - `data-bs-copy-target` (input/textarea value, otherwise `textContent`)
- writes to clipboard via:
  - `navigator.clipboard.writeText()` (preferred)
  - fallback: `document.execCommand('copy')`
- shows feedback via:
  - **swap**: toggles `[data-bs-copy-default]` / `[data-bs-copy-success]`
  - **tooltip**: uses **Bootstrap Tooltip** if available

## Quick start

### 1) Include JavaScript

Copy is included in Tabler’s JavaScript bundle. Make sure you load:

```html
<script src="/dist/js/tabler.js"></script>
```

### 2) Add a trigger

{% capture html -%}
<button
  type="button"
  class="btn"
  data-bs-toggle="copy"
  data-bs-copy-text="INVITE-123"
>
  <span data-bs-copy-default>Copy</span>
  <span data-bs-copy-success hidden>Copied</span>
</button>
{%- endcapture -%}
{% include "docs/example.html" html=html centered %}

## Usage

### Via data attributes (recommended)

Copy is enabled through the Data API:

- add `data-bs-toggle="copy"` to the trigger element
- add `data-bs-copy-text` or `data-bs-copy-target`

{% capture html -%}
<div class="row g-2 align-items-center" style="max-width: 28rem;">
  <div class="col-auto">
    <button
      type="button"
      class="btn"
      data-bs-toggle="copy"
      data-bs-copy-target="#invite"
    >
      <span data-bs-copy-default>Copy</span>
      <span data-bs-copy-success hidden>Copied</span>
    </button>
  </div>
  <div class="col">
    <input id="invite" class="form-control" value="INVITE-123" readonly>
  </div>
</div>
{%- endcapture -%}
{% include "docs/example.html" html=html centered %}

### Via JavaScript

```js
import { Clipboard as Copy } from '@tabler/core'

const el = document.querySelector('[data-bs-toggle="copy"]')
const instance = Copy.getOrCreateInstance(el)

instance.copy()
```

## Markup

### Swap feedback (default)

The plugin looks for these optional elements **inside** the trigger:

- `[data-bs-copy-default]` — visible by default
- `[data-bs-copy-success]` — shown after copy; should start with `hidden`

{% capture html -%}
<button type="button" class="btn" data-bs-toggle="copy" data-bs-copy-text="Hello">
  <span data-bs-copy-default>Copy</span>
  <span data-bs-copy-success hidden>Copied</span>
</button>
{%- endcapture -%}
{% include "docs/example.html" html=html centered %}

### Tooltip feedback

Tooltip feedback does **not** require the two spans. It uses Bootstrap Tooltip if present:

{% capture html -%}
<div class="row g-2 align-items-center" style="max-width: 28rem;">
  <div class="col">
    <input id="token" class="form-control" value="sk_live_123" readonly>
  </div>
  <div class="col-auto">
    <button
      type="button"
      class="btn"
      data-bs-toggle="copy"
      data-bs-copy-target="#token"
      data-bs-copy-feedback="tooltip"
      data-bs-copy-tooltip="Copied!"
    >
      Copy token
    </button>
  </div>
</div>
{%- endcapture -%}
{% include "docs/example.html" html=html centered %}

> Tooltip mode requires Bootstrap Tooltip + Popper.  
> If Tooltip isn’t available, Copy falls back to **swap** behavior.

## Options

Options can be passed via data attributes (`data-bs-copy-*`) or JS configuration.

### Data attribute options

| Name | Type | Default | Description |
|---|---:|---:|---|
| `data-bs-copy-text` | string | — | Explicit text to copy (highest priority). |
| `data-bs-copy-target` | string (selector) | — | Element selector to copy from. For inputs/textarea it copies `value`; otherwise it copies `textContent`. |
| `data-bs-copy-timeout` | number (ms) | `1500` | Duration to show copied feedback before reset (if enabled). |
| `data-bs-copy-reset` | boolean | `true` | Whether to automatically revert from “Copied” back to default state. Use `"false"` to disable. |
| `data-bs-copy-extend` | boolean | `true` | If true, repeated successful copies extend the reset timer. |
| `data-bs-copy-recopy` | boolean | `true` | If false and currently “Copied”, subsequent activations only extend timer (if enabled) without writing to clipboard again. |
| `data-bs-copy-feedback` | `"swap" \| "tooltip"` | `"swap"` | Feedback mode. Tooltip requires Bootstrap Tooltip. |
| `data-bs-copy-tooltip` | string | `"Copied!"` | Tooltip text (tooltip mode only). |
| `data-bs-copy-tooltip-placement` | string | `"top"` | Tooltip placement (tooltip mode only). |

### JavaScript options

```js
import { Clipboard as Copy } from '@tabler/core'

Copy.getOrCreateInstance(el, {
  timeout: 1200,
  reset: true,
  extend: true,
  recopy: true,
  feedback: 'swap', // or 'tooltip'
  tooltip: 'Copied!',
  tooltipPlacement: 'top',
})
```

## Methods

### `copy()`

Copies text and triggers feedback.

```js
import { Clipboard as Copy } from '@tabler/core'

const instance = Copy.getOrCreateInstance(el)
instance.copy()
```

### `reset()`

Resets UI back to the default state (useful when `data-bs-copy-reset="false"`).

```js
import { Clipboard as Copy } from '@tabler/core'

const instance = Copy.getOrCreateInstance(el)
instance.reset()
```

### `dispose()`

Destroys the instance and clears timers.

```js
import { Clipboard as Copy } from '@tabler/core'

const instance = Copy.getOrCreateInstance(el)
instance.dispose()
```

### `Copy.getInstance(element)`

Returns the existing instance for an element, or `null` if none exists.

```js
import { Clipboard as Copy } from '@tabler/core'

Copy.getInstance(el)
```

### `Copy.getOrCreateInstance(element, config?)`

Returns an existing instance or creates a new one.

```js
import { Clipboard as Copy } from '@tabler/core'

Copy.getOrCreateInstance(el)
```

## Events

Copy emits Bootstrap-style events on the trigger element.

| Event | Description | Cancelable |
|---|---|---|
| `copy.bs.copy` | Fired immediately before copying. Access `event.detail.text` and `event.detail.target`. | **Yes** (call `event.preventDefault()`) |
| `copied.bs.copy` | Fired after a successful copy. | No |
| `copyfail.bs.copy` | Fired when copying fails (no text / clipboard error). `event.detail.reason` describes the cause. | No |
| `reset.bs.copy` | Fired when the UI resets back to default. | No |

### Event example

```js
document.addEventListener('copy.bs.copy', (e) => {
  if (!e.detail.text) e.preventDefault()
})

document.addEventListener('copied.bs.copy', (e) => {
  console.log('Copied:', e.detail.text)
})

document.addEventListener('copyfail.bs.copy', (e) => {
  console.warn('Copy failed:', e.detail.reason)
})
```

## Examples

### Copy from an input group

{% capture html -%}
<div class="input-group" style="max-width: 460px;">
  <input id="invite-group" class="form-control" value="INVITE-123" readonly>
  <button class="btn" type="button" data-bs-toggle="copy" data-bs-copy-target="#invite-group">
    <span data-bs-copy-default>Copy</span>
    <span data-bs-copy-success hidden>Copied</span>
  </button>
</div>
{%- endcapture -%}
{% include "docs/example.html" html=html centered %}

### Copy a code snippet

{% capture html -%}
<div class="card" style="max-width: 720px;">
  <div class="card-header d-flex justify-content-between align-items-center">
    <strong>Install</strong>
    <button type="button" class="btn btn-sm" data-bs-toggle="copy" data-bs-copy-target="#snippet">
      <span data-bs-copy-default>Copy</span>
      <span data-bs-copy-success hidden>Copied</span>
    </button>
  </div>
  <div class="card-body">
    <pre id="snippet" class="mb-0"><code>npm install @tabler/core</code></pre>
  </div>
</div>
{%- endcapture -%}
{% include "docs/example.html" html=html centered %}

### Tooltip feedback

{% capture html -%}
<button
  type="button"
  class="btn"
  data-bs-toggle="copy"
  data-bs-copy-text="sk_live_123"
  data-bs-copy-feedback="tooltip"
  data-bs-copy-tooltip="Copied!"
  data-bs-copy-timeout="900"
>
  Copy token
</button>
{%- endcapture -%}
{% include "docs/example.html" html=html centered %}

## Accessibility

- Prefer using a `<button type="button">` for triggers.
- If you use an `<a>` as a trigger, set `role="button"` and ensure it is keyboard accessible.
- Consider adding `aria-live="polite"` to the trigger to announce changes for assistive tech.
- In swap mode, the plugin toggles `hidden` on the feedback elements; ensure the success text is meaningful (e.g. “Copied”).

## Browser support notes

- Clipboard API (`navigator.clipboard`) typically requires a **secure context** (HTTPS) and user interaction.
- Fallback (`document.execCommand('copy')`) may be inconsistent across older browsers and restricted environments.

