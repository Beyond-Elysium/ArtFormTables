---
title: Countup
summary: A countup element is used to display numerical data in an interesting way and make the interface more interactive.
description: Display numbers dynamically with countups.
---

The countup component is built into Tabler and works similar to Bootstrap components. It animates numbers dynamically, making the interface more interactive and engaging.

For more advanced features of countups, see the demo on the [countUp.js website](https://inorganik.github.io/countUp.js/).

## Basic usage

The easiest way to use countup is through the Data API. Add the `data-countup` attribute to any HTML text element and specify the number which is to be reached. The animation will be triggered as soon as the number enters the viewport.

```html
<h1 data-countup>30000</h1>
```

The results can be seen in the example below.

{% capture html -%}
<h1 data-countup>30000</h1>
{%- endcapture %}
{% include "docs/example.html" html=html centered %}

## Duration

Set the `duration` to determine how long the animation should take. By default, the duration is set to 2 seconds, but you can modify it as you wish.

{% capture html -%}
<h1 data-countup>30000</h1>
<h1 data-countup='{"duration":4}'>30000</h1>
<h1 data-countup='{"duration":6}'>30000</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Starting value

By default the countup will start from zero. If you want to set a different start value use `startVal`.
You can also set the start value to be greater than the final value, so that it counts down instead of up.
To see how the starting value affects the animation, look at the example below.

{% capture html -%}
<h1 data-countup='{"startVal":12345}'>30000</h1>
<h1 data-countup='{"startVal":47655}'>30000</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Decimal places

Set how many decimal numbers should be displayed using `decimalPlaces`. By default, the number of decimal places is set to 0.

{% capture html -%}
<h1 data-countup>3.123</h1>
<h1 data-countup='{"decimalPlaces":1}'>3.123</h1>
<h1 data-countup='{"decimalPlaces":2}'>3.123</h1>
<h1 data-countup='{"decimalPlaces":3}'>3.123</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Easing

Disable easing using `"useEasing": false`. Easing is set to `true` by default, so that the animation speed changes over the course of its duration. Easing can be disabled to make the animation linear.

{% capture html -%}
<h1 data-countup>30000</h1>
<h1 data-countup='{"useEasing": false}'>30000</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Use grouping

Disable grouping using `"useGrouping": false`. Grouping is set to `true` by default, so that the number is displayed with a separator.

{% capture html -%}
<h1 data-countup>30000</h1>
<h1 data-countup='{"useGrouping": false}'>30000</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Separator

You can change the default separator using `separator` and specifying the one you wish to use.

{% capture html -%}
<h1 data-countup>3000000</h1>
<h1 data-countup='{"separator":" "}'>3000000</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Decimal separator

You can change the default decimal separator using `decimal` and specifying the one you wish to use.

{% capture html -%}
<h1 data-countup='{"decimalPlaces":2}'>3.12</h1>
<h1 data-countup='{"decimalPlaces":2,"decimal":","}'>3.12</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Prefix

Set the countup prefix using `prefix` and specifying the prefix you want to add, for instance a currency symbol.

{% capture html -%}
<h1 data-countup='{"prefix":"$"}'>30000</h1>
<h1 data-countup='{"prefix":"€"}'>30000</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Suffix

Set the countup suffix using `suffix` and specifying the suffix you want to add, for instance a percentage symbol.

{% capture html -%}
<h1 data-countup='{"suffix":"%"}'>300</h1>
<h1 data-countup='{"suffix":"‰"}'>300</h1>
{%- endcapture %}
{% include "docs/example.html" html=html vertical separated %}

## Usage

### Via data attributes

Add `data-countup` to any HTML text element to automatically initialize countup. You can pass options as JSON:

```html
<h1 data-countup>30000</h1>
<h1 data-countup='{"duration":4,"prefix":"$"}'>30000</h1>
```

### Via JavaScript

Initialize countup programmatically using the `Countup` class:

```javascript
import { Countup } from '@tabler/core'

// Get or create instance
const element = document.querySelector('[data-countup]')
const countup = Countup.getOrCreateInstance(element)
countup.init()
```

### Methods

| Method | Description |
| --- | --- |
| `init()` | Initialize countup on the element. |
| `update()` | Update countup when the target value changes programmatically. |
| `dispose()` | Destroy countup instance. |
| `getInstance(element)` | *Static* method which allows you to get the countup instance associated with a DOM element. |
| `getOrCreateInstance(element)` | *Static* method which allows you to get the countup instance associated with a DOM element, or create a new one in case it wasn't initialized. |

#### Example: Update after value change

```javascript
import { Countup } from '@tabler/core'

const element = document.querySelector('[data-countup]')
const countup = Countup.getOrCreateInstance(element)
countup.init()

// Later, when the target value changes programmatically
element.innerHTML = '50000'
countup.update()
```

#### Example: Get existing instance

```javascript
import { Countup } from '@tabler/core'

const element = document.querySelector('[data-countup]')
const countup = Countup.getInstance(element)

if (countup) {
  countup.update()
}
```
