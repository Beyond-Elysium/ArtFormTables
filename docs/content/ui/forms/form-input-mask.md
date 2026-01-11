---
title: Input mask
summary: An input mask is used to clarify the input format required in a given field and is helpful for users, removing confusion and reducing the number of validation errors.
description: Clarify input formats for users.
---

The input mask component is built into Tabler and works similar to Bootstrap components. It automatically applies input masks to form fields to clarify the required format.

For more advanced features of input masks, see the [IMask documentation](https://imask.js.org/guide.html#masked-input).

## Basic usage

The easiest way to use input mask is through the Data API. Add the `data-mask` attribute to the input element:

```html
<input
  type="text"
  name="input-mask"
  class="form-control"
  data-mask="(00) 0000-0000"
  placeholder="(00) 0000-0000"
  autocomplete="off"
/>
```

Look at the example below to see how the input mask works:

{% capture html -%}
<label class="form-label">Telephone mask</label>
<input
  type="text"
  name="input-mask"
  class="form-control"
  data-mask="(00) 0000-0000"
  data-mask-visible="true"
  placeholder="(00) 0000-0000"
  autocomplete="off"
/>
{%- endcapture %}
{% include "docs/example.html" html=html %}

## More examples

If you need more examples of input masks, you can find them in the [IMask documentation](https://imask.js.org/guide.html#masked-input).

## Usage

### Via data attributes

Add `data-mask` to an input element to automatically initialize input mask. You can also add `data-mask-visible="true"` to show the mask placeholder:

```html
<input
  type="text"
  class="form-control"
  data-mask="(00) 0000-0000"
  data-mask-visible="true"
  placeholder="(00) 0000-0000"
  autocomplete="off"
/>
```

### Via JavaScript

Initialize input mask programmatically using the `InputMask` class:

```javascript
import { InputMask } from '@tabler/core'

// Get or create instance
const input = document.querySelector('[data-mask]')
const inputMask = InputMask.getOrCreateInstance(input)
inputMask.init()
```

### Methods

| Method | Description |
| --- | --- |
| `init()` | Initialize input mask on the element. |
| `update(mask?, options?)` | Update input mask when mask or options change programmatically. |
| `getValue()` | Get the current masked value. |
| `getUnmaskedValue()` | Get the current unmasked value. |
| `dispose()` | Destroy input mask instance. |
| `getInstance(element)` | *Static* method which allows you to get the input mask instance associated with a DOM element. |
| `getOrCreateInstance(element)` | *Static* method which allows you to get the input mask instance associated with a DOM element, or create a new one in case it wasn't initialized. |

#### Example: Update mask programmatically

```javascript
import { InputMask } from '@tabler/core'

const input = document.querySelector('[data-mask]')
const inputMask = InputMask.getOrCreateInstance(input)
inputMask.init()

// Later, update the mask
inputMask.update('000-000-0000')
```

#### Example: Get values

```javascript
import { InputMask } from '@tabler/core'

const input = document.querySelector('[data-mask]')
const inputMask = InputMask.getOrCreateInstance(input)
inputMask.init()

// Get masked value (e.g., "(12) 3456-7890")
const maskedValue = inputMask.getValue()

// Get unmasked value (e.g., "1234567890")
const unmaskedValue = inputMask.getUnmaskedValue()
```

#### Example: Get existing instance

```javascript
import { InputMask } from '@tabler/core'

const input = document.querySelector('[data-mask]')
const inputMask = InputMask.getInstance(input)

if (inputMask) {
  const value = inputMask.getValue()
  console.log('Masked value:', value)
}
```