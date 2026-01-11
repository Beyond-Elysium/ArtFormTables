---
title: Theme Customization
summary: Tabler provides multiple ways to customize themes including HTML attributes, CSS classes, CSS custom properties, and JavaScript API. Learn how to control color mode, primary colors, fonts, base colors, and border radius to create a personalized user experience.
description: Customize Tabler themes using attributes, CSS, and JavaScript.
bootstrapLink: customize/color-modes/
---

Tabler offers flexible theme customization through multiple methods. You can control the color mode (light/dark), primary color, font family, base color scheme, and border radius using HTML attributes, CSS classes, CSS custom properties, or the JavaScript API.

## Color Mode (Light/Dark)

### Using HTML Attributes

The most common way to control the color mode is by setting the `data-bs-theme` attribute on the `<html>` element:

```html
<html data-bs-theme="dark">
  <!-- Dark mode content -->
</html>
```

Available values:
- `light` - Light color mode (default)
- `dark` - Dark color mode

### Using JavaScript

You can dynamically change the theme using JavaScript:

```javascript
// Set dark mode
document.documentElement.setAttribute('data-bs-theme', 'dark')

// Set light mode
document.documentElement.setAttribute('data-bs-theme', 'light')

// Remove attribute to use default (light)
document.documentElement.removeAttribute('data-bs-theme')
```

### Using URL Parameters

Tabler automatically reads theme settings from URL parameters. You can link to pages with specific themes:

```html
<a href="?theme=dark">Switch to Dark Mode</a>
<a href="?theme=light">Switch to Light Mode</a>
```

### Using CSS Classes

You can also use CSS classes for theme control:

```html
<html class="theme-dark">
  <!-- Dark mode content -->
</html>
```

## Primary Color

### Using HTML Attributes

Set the primary color using the `data-bs-theme-primary` attribute:

```html
<html data-bs-theme-primary="red">
  <!-- Red primary color -->
</html>
```

Available values include: `blue`, `azure`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `lime`, `green`, `teal`, `cyan`, and more.

### Using JavaScript

```javascript
document.documentElement.setAttribute('data-bs-theme-primary', 'red')
document.documentElement.setAttribute('data-bs-theme-primary', 'green')
document.documentElement.setAttribute('data-bs-theme-primary', 'purple')
```

### Using URL Parameters

```html
<a href="?theme-primary=red">Red Theme</a>
<a href="?theme-primary=green">Green Theme</a>
```

## Base Color Scheme

### Using HTML Attributes

Control the gray color scheme using `data-bs-theme-base`:

```html
<html data-bs-theme-base="slate">
  <!-- Slate gray scheme -->
</html>
```

Available values: `slate`, `gray`, `zinc`, `neutral`, `stone`

### Using JavaScript

```javascript
document.documentElement.setAttribute('data-bs-theme-base', 'slate')
document.documentElement.setAttribute('data-bs-theme-base', 'gray')
document.documentElement.setAttribute('data-bs-theme-base', 'zinc')
```

## Font Family

### Using HTML Attributes

Set the font family with `data-bs-theme-font`:

```html
<html data-bs-theme-font="monospace">
  <!-- Monospace font -->
</html>
```

Available values: `sans-serif`, `serif`, `monospace`, `comic`

### Using JavaScript

```javascript
document.documentElement.setAttribute('data-bs-theme-font', 'monospace')
document.documentElement.setAttribute('data-bs-theme-font', 'serif')
```

## Border Radius

### Using HTML Attributes

Control border radius factor with `data-bs-theme-radius`:

```html
<html data-bs-theme-radius="2">
  <!-- Larger border radius -->
</html>
```

Available values: `0`, `0.5`, `1`, `1.5`, `2`

### Using JavaScript

```javascript
document.documentElement.setAttribute('data-bs-theme-radius', '0')
document.documentElement.setAttribute('data-bs-theme-radius', '1')
document.documentElement.setAttribute('data-bs-theme-radius', '2')
```

## Combining Multiple Settings

You can combine multiple theme attributes on the same element:

```html
<html 
  data-bs-theme="dark" 
  data-bs-theme-primary="red" 
  data-bs-theme-base="slate" 
  data-bs-theme-font="monospace" 
  data-bs-theme-radius="2">
  <!-- Custom themed page -->
</html>
```

Or using JavaScript:

```javascript
const html = document.documentElement
html.setAttribute('data-bs-theme', 'dark')
html.setAttribute('data-bs-theme-primary', 'red')
html.setAttribute('data-bs-theme-base', 'slate')
html.setAttribute('data-bs-theme-font', 'monospace')
html.setAttribute('data-bs-theme-radius', '2')
```

## Using CSS Custom Properties

Tabler uses CSS custom properties (variables) that you can override directly:

```html
<style>
  :root {
    --tblr-primary: #d63939; /* Red */
    --tblr-body-font-family: 'Courier New', monospace;
    --tblr-border-radius-scale: 2;
  }
</style>
```

You can also target specific theme modes:

```css
[data-bs-theme='dark'] {
  --tblr-primary: #ff6b6b;
  --tblr-body-bg: #1a1a1a;
}
```

## Using JavaScript API

Tabler provides a convenient JavaScript API for theme manipulation. The API automatically handles DOM updates, localStorage persistence, and URL updates.

### Basic Usage

```html
<script src="{{ cdnUrl }}/dist/js/tabler.min.js"></script>
<script>
  Tabler.setTheme('dark')
  Tabler.setPrimary('red')
  Tabler.setBase('slate')
  Tabler.setFont('monospace')
  Tabler.setRadius('2')
</script>
```

### Available Methods

- `Tabler.setTheme(value)` - Set color mode (`light` or `dark`)
- `Tabler.setPrimary(value)` - Set primary color
- `Tabler.setBase(value)` - Set base color scheme
- `Tabler.setFont(value)` - Set font family
- `Tabler.setRadius(value)` - Set border radius factor
- `Tabler.reset()` - Reset all settings to defaults
- `Tabler.getConfig()` - Get current theme configuration

### Example: Theme Switcher

```html
<button onclick="Tabler.setTheme('dark')">Dark Mode</button>
<button onclick="Tabler.setTheme('light')">Light Mode</button>
<button onclick="Tabler.setPrimary('red')">Red Theme</button>
<button onclick="Tabler.reset()">Reset</button>
```

## Persistence with localStorage

Tabler automatically saves theme settings to `localStorage` when using the JavaScript API. Settings are stored with keys like:
- `tabler-theme`
- `tabler-theme-primary`
- `tabler-theme-base`
- `tabler-theme-font`
- `tabler-theme-radius`

You can manually read and write to localStorage:

```javascript
// Save theme setting
localStorage.setItem('tabler-theme', 'dark')

// Read theme setting
const theme = localStorage.getItem('tabler-theme') || 'light'
document.documentElement.setAttribute('data-bs-theme', theme)
```

## Scoped Themes

You can apply themes to specific elements instead of the entire page:

```html
<div data-bs-theme="dark">
  <div class="card">
    <!-- This card uses dark theme -->
  </div>
</div>

<div data-bs-theme="light">
  <div class="card">
    <!-- This card uses light theme -->
  </div>
</div>
```

## Complete Example

Here's a complete example showing different ways to control themes:

```html
<!doctype html>
<html lang="en" data-bs-theme="light">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Theme Customization</title>
    <link rel="stylesheet" href="{{ cdnUrl }}/dist/css/tabler.min.css" />
  </head>
  <body>
    <div class="container-xl">
      <div class="page-header">
        <h1 class="page-title">Theme Customization</h1>
      </div>
      
      <div class="card">
        <div class="card-body">
          <h3>Method 1: Direct Attribute Manipulation</h3>
          <button 
            class="btn" 
            onclick="document.documentElement.setAttribute('data-bs-theme', 'dark')">
            Set Dark Mode
          </button>
          <button 
            class="btn" 
            onclick="document.documentElement.setAttribute('data-bs-theme', 'light')">
            Set Light Mode
          </button>
          
          <h3 class="mt-4">Method 2: Using Tabler API</h3>
          <button class="btn" onclick="Tabler.setTheme('dark')">
            Dark Mode (API)
          </button>
          <button class="btn" onclick="Tabler.setPrimary('red')">
            Red Primary (API)
          </button>
          <button class="btn" onclick="Tabler.reset()">
            Reset (API)
          </button>
          
          <h3 class="mt-4">Method 3: URL Parameters</h3>
          <a href="?theme=dark&theme-primary=red" class="btn">
            Dark + Red via URL
          </a>
        </div>
      </div>
    </div>
    
    <script src="{{ cdnUrl }}/dist/js/tabler.min.js"></script>
  </body>
</html>
```

## Best Practices

1. **Initialize on Load**: Apply saved theme settings when the page loads
2. **User Preferences**: Consider saving user preferences to your backend
3. **Smooth Transitions**: Add CSS transitions for smoother theme changes
4. **Accessibility**: Ensure theme changes don't break accessibility features
5. **Consistency**: Use the same method (API, attributes, or CSS) throughout your application

## Bootstrap Documentation

Tabler's theme system is built on top of Bootstrap's color mode and CSS variables system. For more information, see:

- [Bootstrap Color Modes](https://getbootstrap.com/docs/5.3/customize/color-modes/) - Learn about Bootstrap's dark mode implementation
- [Bootstrap CSS Variables](https://getbootstrap.com/docs/5.3/customize/css-variables/) - Understand how CSS custom properties work in Bootstrap
- [Bootstrap Theming](https://getbootstrap.com/docs/5.3/customize/overview/) - General theming and customization guide

## Related Documentation

- [Customize Tabler](/ui/getting-started/customize) - Learn about CSS customization
- [Installation](/ui/getting-started/installation) - Set up Tabler in your project
- [Colors](/ui/base/colors) - Understand Tabler's color system
