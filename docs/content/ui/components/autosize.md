---
title: Autosize
summary: The autosize element will automatically adjust the textarea height and make it easier for users to follow as they type.
description: Auto-adjusting textarea for better usability.
---

The autosize component is built into Tabler and works similar to Bootstrap components. It automatically adjusts textarea height as users type.

## Basic usage

The easiest way to use autosize is through the Data API. Add the `data-bs-autosize` attribute to the textarea element:

{% capture html -%}
<label class="form-label">Autosize example</label>
<textarea class="form-control" data-bs-autosize placeholder="Type something…"></textarea>
{%- endcapture %}
{% include "docs/example.html" html=html column vertical %}

## With initial rows

You can set an initial number of rows for the textarea:

{% capture html -%}
<label class="form-label">Autosize with initial rows</label>
<textarea class="form-control" data-bs-autosize rows="3" placeholder="Type something…"></textarea>
{%- endcapture %}
{% include "docs/example.html" html=html column vertical %}

## Usage

### Via data attributes

Add `data-bs-autosize` to a textarea element to automatically initialize autosize:

```html
<textarea class="form-control" data-bs-autosize placeholder="Type something…"></textarea>
```

### Via JavaScript

Initialize autosize programmatically using the `Autosize` class:

```javascript
import { Autosize } from '@tabler/core'

// Get or create instance
const textarea = document.querySelector('textarea')
const autosize = Autosize.getOrCreateInstance(textarea)
autosize.init()
```

### Methods

| Method | Description |
| --- | --- |
| `init()` | Initialize autosize on the element. |
| `update()` | Update autosize when content changes programmatically. |
| `dispose()` | Destroy autosize instance. |
| `getInstance(element)` | *Static* method which allows you to get the autosize instance associated with a DOM element. |
| `getOrCreateInstance(element)` | *Static* method which allows you to get the autosize instance associated with a DOM element, or create a new one in case it wasn't initialized. |

#### Example: Update after content change

```javascript
import { Autosize } from '@tabler/core'

const textarea = document.querySelector('textarea')
const autosize = Autosize.getOrCreateInstance(textarea)
autosize.init()

// Later, when content changes programmatically
textarea.value = 'New content that is longer than before...'
autosize.update()
```

#### Example: Get existing instance

```javascript
import { Autosize } from '@tabler/core'

const textarea = document.querySelector('textarea')
const autosize = Autosize.getInstance(textarea)

if (autosize) {
  autosize.update()
}
```
