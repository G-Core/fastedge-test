# Component Styling and Structure Pattern

## Overview

This document describes the established component structure pattern for the fastedge-test frontend. All components should follow this folder-per-component approach with CSS Modules.

## Component Folder Structure

Each component should be organized as a self-contained folder:

```
/components
  /ComponentName
    ComponentName.tsx          (component implementation)
    ComponentName.module.css   (scoped styles)
    index.tsx                  (barrel export)
```

### Example: Toggle Component

```
/components
  /Toggle
    Toggle.tsx
    Toggle.module.css
    index.tsx
```

**index.tsx** (barrel export):

```tsx
export { Toggle } from "./Toggle";
```

**Usage in other components**:

```tsx
import { Toggle } from "./Toggle"; // Auto-resolves to index.tsx
```

## CSS Modules Pattern

### Why CSS Modules?

- **Built-in Vite support** - No additional configuration needed
- **Scoped styles** - Class names automatically scoped to prevent conflicts
- **Type safety** - Can generate TypeScript definitions for class names
- **Clean separation** - Styles separate from JSX
- **Simple imports** - Standard ES6 import syntax

### CSS Module Example

**Toggle.module.css**:

```css
.toggleLabel {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.toggleLabel.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.toggleSwitch {
  position: relative;
  width: 44px;
  height: 24px;
  background-color: #cbd5e1;
  border-radius: 12px;
  transition: background-color 0.2s ease;
  cursor: pointer;
}

.toggleSwitch.checked {
  background-color: #4ade80;
}

.toggleSwitch.disabled {
  cursor: not-allowed;
}

.toggleSlider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background-color: #ffffff;
  border-radius: 50%;
  transition: left 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggleSwitch.checked .toggleSlider {
  left: 22px;
}

.toggleLabel span {
  font-size: 14px;
}
```

**Toggle.tsx**:

```tsx
import { CSSProperties } from "react";
import styles from "./Toggle.module.css";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  style,
}: ToggleProps) {
  const toggleLabelClass = `${styles.toggleLabel} ${disabled ? styles.disabled : ""}`;
  const toggleSwitchClass = `${styles.toggleSwitch} ${checked ? styles.checked : ""} ${disabled ? styles.disabled : ""}`;

  return (
    <label className={toggleLabelClass} style={style}>
      {label && <span>{label}</span>}
      <div
        className={toggleSwitchClass}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) {
            onChange(!checked);
          }
        }}
      >
        <div className={styles.toggleSlider} />
      </div>
    </label>
  );
}
```

## Creating or Converting a Component

### Step-by-Step Process

1. **Create component folder**

   ```bash
   mkdir -p frontend/src/components/common/ComponentName   # or proxy-wasm/
   ```

2. **Move component file**

   ```bash
   mv ComponentName.tsx frontend/src/components/common/ComponentName/ComponentName.tsx
   ```

3. **Extract inline styles to CSS Module**
   - Create `ComponentName.module.css`
   - Convert all `style={{}}` props to CSS classes
   - Use descriptive class names (camelCase)
   - Keep dynamic styles as inline when needed (e.g., `style={{ width: dynamicWidth }}`)

4. **Update component imports**

   ```tsx
   import styles from "./ComponentName.module.css";
   ```

5. **Create barrel export**
   Create `index.tsx`:

   ```tsx
   export { ComponentName } from "./ComponentName";
   ```

6. **Update any imports in other files** (if needed)
   - Usually not needed if using relative imports like `"./ComponentName"`

### Best Practices

#### When to use CSS Modules vs inline styles

- **CSS Modules**: Static styles that don't change
- **Inline styles**: Dynamic values, `style` prop passthrough
- **Combination**: Use both when needed
  ```tsx
  <div className={styles.container} style={{ width: dynamicWidth }}>
  ```

#### Class Name Composition

```tsx
// Single class
<div className={styles.button}>

// Conditional classes
<div className={`${styles.button} ${isActive ? styles.active : ""}`}>

// Multiple conditional classes
const className = `${styles.base} ${disabled ? styles.disabled : ""} ${checked ? styles.checked : ""}`;
<div className={className}>
```

#### Pseudo-classes and States

```css
/* Hover states */
.button:hover {
  background-color: #e0e0e0;
}

/* Multiple state classes */
.button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button.active {
  background-color: #4ade80;
}
```

#### Nested Selectors

```css
.container {
  padding: 20px;
}

.container .header {
  font-weight: bold;
}

/* Or use child combinator */
.container > .header {
  font-weight: bold;
}
```

## Benefits of This Approach

1. **Maintainability** - All component-related files in one place
2. **Readability** - JSX is cleaner without inline style objects
3. **Performance** - Styles are extracted and cached by Vite
4. **Reusability** - Easy to share styles between similar components
5. **Scalability** - Simple to add tests, docs, or sub-components
6. **Developer Experience** - IntelliSense for CSS class names
7. **Consistency** - Standardized pattern across the codebase

## Why This Pattern

CSS Modules with folder-per-component were chosen over inline styles and global CSS: built-in Vite support, clean separation, and room for a component's tests (`ComponentName.test.tsx`) next to it.

## Tools and Commands

### Creating new component with this pattern

```bash
# Create folder (common/ if shared by views, proxy-wasm/ if CDN-only)
mkdir -p frontend/src/components/common/NewComponent

# Create files (can use templates or copy from Toggle)
touch frontend/src/components/common/NewComponent/NewComponent.tsx
touch frontend/src/components/common/NewComponent/NewComponent.module.css
touch frontend/src/components/common/NewComponent/index.tsx
```

### Searching for inline styles

```bash
# Find components with inline styles
grep -r "style={{" frontend/src/components/
```

### Building and testing

```bash
# Development (from the repo root)
pnpm install
pnpm run dev            # backend + Vite dev server

# Frontend tests and build
pnpm run test:frontend
pnpm run build:frontend
```
