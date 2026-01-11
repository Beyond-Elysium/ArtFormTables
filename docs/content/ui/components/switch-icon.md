---
title: Switch icon
summary: The Switch Icon component is used to create a transition between two icons. You can use any icon, both line and filled version.
banner: icons
description: Transition between two icons smoothly.
---

The switch-icon component is built into Tabler and works similar to Bootstrap components. It automatically toggles between two icons when clicked.

## Structure

The switch-icon component requires a specific HTML structure:

```html
<button class="switch-icon" data-bs-toggle="switch-icon">
  <span class="switch-icon-a text-secondary">
    <!-- Icon code here -->
  </span>
  <span class="switch-icon-b text-red">
    <!-- Icon code here -->
  </span>
</button>
```

**Required elements:**
- `button` element with `switch-icon` class and `data-bs-toggle="switch-icon"` attribute
- `switch-icon-a` span containing the first icon (shown by default)
- `switch-icon-b` span containing the second icon (shown when `.active` class is added to the button)

The transition between icons is triggered by adding or removing the `.active` class on the button element.

## Basic usage

The easiest way to use switch-icon is through the Data API. Add the `data-bs-toggle="switch-icon"` attribute to a button element:

{% capture html -%}
{% include "ui/switch-icon.html" icon="heart" icon-b-color="red" %}
{%- endcapture %}
{% include "docs/example.html" html=html centered %}

## Switch animations

You can also add a fancy animation to add variety to your button. Available animation variants:

| Variant | Description |
| --- | --- |
| `fade` | Fade transition between icons. |
| `scale` | Scale animation when switching icons. |
| `flip` | Flip animation when switching icons. |
| `slide-up` | Slide animation from bottom to top. |
| `slide-down` | Slide animation from top to bottom. |
| `slide-left` | Slide animation from right to left. |
| `slide-right` | Slide animation from left to right. |
| `slide-start` | Slide animation from end to start (RTL-aware). |
| `slide-end` | Slide animation from start to end (RTL-aware). |

To add an animation, add the corresponding class to the button element. For example, to use the fade animation, add `switch-icon-fade` class:

```html
<button class="switch-icon switch-icon-fade" data-bs-toggle="switch-icon">
  <span class="switch-icon-a text-secondary">
    <!-- Icon code here -->
  </span>
  <span class="switch-icon-b text-red">
    <!-- Icon code here -->
  </span>
</button>
```

See demo below:

{% capture html -%}
{% include "ui/switch-icon.html" icon="circle" icon-b-color="primary" %}
{% include "ui/switch-icon.html" icon="heart" variant="fade" icon-b-color="red" %}
{% include "ui/switch-icon.html" icon="star" variant="scale" icon-b-color="yellow" %}
{% include "ui/switch-icon.html" icon="thumb-up" variant="flip" icon-b-color="facebook" %}
{% include "ui/switch-icon.html" icon="brand-twitter" icon-b="brand-twitter" variant="slide-up" icon-b-color="twitter" %}
{% include "ui/switch-icon.html" icon="check" icon-b="x" variant="slide-left" icon-b-color="red" %}
{% include "ui/switch-icon.html" icon="arrow-up" icon-b="arrow-down" variant="slide-down" icon-b-color="secondary" %}
{% include "ui/switch-icon.html" icon="car" icon-b="scooter" variant="slide-end" icon-b-color="secondary" %}
{%- endcapture %}
{% include "docs/example.html" html=html centered %}

## Usage

### Via data attributes

Add `data-bs-toggle="switch-icon"` to a button element to automatically initialize switch-icon:

```html
<button class="switch-icon" data-bs-toggle="switch-icon">
  <span class="switch-icon-a text-secondary">
    {% include "ui/icon.html" icon="heart" %}
  </span>
  <span class="switch-icon-b text-red">
    {% include "ui/icon.html" icon="heart" type="filled" %}
  </span>
</button>
```

### Via JavaScript

Initialize switch-icon programmatically using the `SwitchIcon` class:

```javascript
import { SwitchIcon } from '@tabler/core'

// Get or create instance
const button = document.querySelector('.switch-icon')
const switchIcon = SwitchIcon.getOrCreateInstance(button)
switchIcon.init()
```

### Methods

| Method | Description |
| --- | --- |
| `init()` | Initialize switch-icon on the element. |
| `toggle()` | Toggle active state of the switch-icon. |
| `show()` | Activate the switch-icon (add `.active` class). |
| `hide()` | Deactivate the switch-icon (remove `.active` class). |
| `isActive()` | Check if switch-icon is currently active. |
| `dispose()` | Destroy switch-icon instance. |
| `getInstance(element)` | *Static* method which allows you to get the switch-icon instance associated with a DOM element. |
| `getOrCreateInstance(element)` | *Static* method which allows you to get the switch-icon instance associated with a DOM element, or create a new one in case it wasn't initialized. |

#### Example: Toggle programmatically

```javascript
import { SwitchIcon } from '@tabler/core'

const button = document.querySelector('.switch-icon')
const switchIcon = SwitchIcon.getOrCreateInstance(button)
switchIcon.init()

// Later, toggle programmatically
switchIcon.toggle()
```

#### Example: Show/hide programmatically

```javascript
import { SwitchIcon } from '@tabler/core'

const button = document.querySelector('.switch-icon')
const switchIcon = SwitchIcon.getOrCreateInstance(button)
switchIcon.init()

// Activate
switchIcon.show()

// Deactivate
switchIcon.hide()

// Check state
if (switchIcon.isActive()) {
  console.log('Switch icon is active')
}
```

#### Example: Get existing instance

```javascript
import { SwitchIcon } from '@tabler/core'

const button = document.querySelector('.switch-icon')
const switchIcon = SwitchIcon.getInstance(button)

if (switchIcon) {
  switchIcon.toggle()
}
```
