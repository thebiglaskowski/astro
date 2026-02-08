# UI/UX Design Rules

## Core Principles

1. **Simplicity First** — Remove everything that isn't essential
2. **Visual Hierarchy** — Guide the eye to what matters
3. **Whitespace is Your Friend** — Let elements breathe
4. **Consistency** — Same patterns everywhere
5. **Feedback** — Always show system status
6. **Accessibility** — Usable by everyone

---

## Modern Aesthetic Standards

```
DO:
- Clean, minimal interfaces
- Generous whitespace and padding
- Subtle shadows and depth
- Smooth micro-interactions
- Consistent spacing system (8px grid)
- Modern typography (system fonts or clean sans-serif)
- Muted color palettes with vibrant accents
- Rounded corners (but not excessive)
- Clear visual feedback on interactions

DON'T:
- Cluttered layouts
- Too many colors
- Harsh borders everywhere
- Static, lifeless interfaces
- Inconsistent spacing
- Tiny click targets
- Walls of text
- Outdated patterns (skeuomorphism, heavy gradients)
```

---

## Spacing System (8px Grid)

```css
:root {
  --spacing-xs: 4px;    /* Icons, small gaps */
  --spacing-sm: 8px;    /* Inline elements */
  --spacing-md: 16px;   /* Between elements */
  --spacing-lg: 24px;   /* Sections */
  --spacing-xl: 32px;   /* Major sections */
  --spacing-2xl: 48px;  /* Page sections */
}
```

### Usage
- All spacing should be multiples of 4px
- Use variables, not magic numbers
- Consistent padding inside components

---

## Typography Scale

```css
:root {
  --text-xs: 0.75rem;   /* 12px - captions */
  --text-sm: 0.875rem;  /* 14px - secondary */
  --text-base: 1rem;    /* 16px - body */
  --text-lg: 1.125rem;  /* 18px - emphasized */
  --text-xl: 1.25rem;   /* 20px - subheadings */
  --text-2xl: 1.5rem;   /* 24px - headings */
  --text-3xl: 2rem;     /* 32px - page titles */
}
```

### Typography Rules
- Maximum 2 font families
- Clear type scale (headings, body, captions)
- Readable line heights (1.4-1.6 for body)
- Appropriate font weights
- Good contrast ratios

---

## Color Usage

| Purpose | Usage | Example |
|---------|-------|---------|
| Primary | Main actions, links | Buttons, CTAs |
| Secondary | Supporting actions | Secondary buttons |
| Success | Confirmations, completed | Toasts, badges |
| Warning | Caution, attention needed | Alerts |
| Error | Failures, destructive | Form errors |
| Neutral | Text, borders, backgrounds | Body, dividers |

### Color Rules
- Cohesive color palette
- Primary, secondary, accent colors defined
- Semantic colors (success, warning, error)
- Dark mode support (if applicable)
- WCAG AA contrast compliance (4.5:1 minimum)

---

## Shadow System

```css
:root {
  /* Subtle elevation */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  --shadow-xl: 0 20px 25px rgba(0,0,0,0.1);
}
```

### Common Fixes
```css
/* Before: harsh */
box-shadow: 0 0 10px black;

/* After: subtle depth */
box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
```

---

## Component Standards

### Buttons
```css
/* Sizing */
Small: height 32px, padding 8px 12px
Medium: height 40px, padding 10px 16px
Large: height 48px, padding 12px 24px

/* States */
Default → Hover → Active → Disabled
Focus ring on keyboard navigation
```

### Forms
- Labels above inputs (not inline)
- Clear placeholder text
- Visible focus states
- Error messages below inputs
- Required field indicators
- Touch targets min 44x44px

### Cards
- Consistent border radius (8px or 12px)
- Subtle shadow for depth
- Adequate padding (16-24px)
- Clear visual hierarchy inside

---

## Responsive Design

### Breakpoints
```css
:root {
  --mobile: 320px;
  --tablet: 768px;
  --desktop: 1024px;
  --wide: 1280px;
}
```

### Mobile First
- Design for mobile first
- Enhance for larger screens
- Touch-friendly by default
- Avoid hover-only interactions
- Bottom nav for key actions
- Thumb-friendly button placement

---

## Accessibility Checklist

- [ ] Color contrast ratio >= 4.5:1 (text)
- [ ] Color contrast ratio >= 3:1 (large text, icons)
- [ ] No information conveyed by color alone
- [ ] Focus indicators visible
- [ ] Skip links for navigation
- [ ] Alt text on images
- [ ] Semantic HTML (nav, main, article)
- [ ] ARIA labels where needed
- [ ] Keyboard navigable
- [ ] Touch targets >= 44px

---

## Animation Guidelines

### Timing
```css
:root {
  --duration-fast: 150ms;    /* Micro-interactions */
  --duration-normal: 250ms;  /* Standard transitions */
  --duration-slow: 350ms;    /* Complex animations */
}
```

### Principles
- Use motion purposefully
- Respect prefers-reduced-motion
- Keep under 400ms for UI
- Ease-out for entering
- Ease-in for exiting

### Common Fixes
```css
/* Before: jarring */
.button:hover { background: blue; }

/* After: smooth */
.button {
  transition: all 150ms ease;
}
.button:hover { background: blue; }
```

---

## Modern UI Checklist

### Layout
- [ ] Uses CSS Grid or Flexbox appropriately
- [ ] Responsive breakpoints defined
- [ ] Consistent spacing scale
- [ ] Proper visual hierarchy
- [ ] Adequate whitespace

### Components
- [ ] Consistent button styles
- [ ] Form inputs have focus states
- [ ] Cards/containers have subtle shadows
- [ ] Icons are consistent style
- [ ] Loading states exist

### Interactions
- [ ] Hover states on interactive elements
- [ ] Focus indicators for accessibility
- [ ] Smooth transitions (150-300ms)
- [ ] Feedback on actions (toasts, alerts)
- [ ] Skeleton loaders for async content

### Mobile
- [ ] Touch targets min 44x44px
- [ ] No horizontal scroll
- [ ] Readable without zoom
- [ ] Bottom nav for key actions
- [ ] Thumb-friendly button placement

---

## Framework-Specific Guidance

### React/Next.js
- Use CSS Modules, Tailwind, or styled-components
- Leverage component composition
- Consider Radix UI, shadcn/ui, or Headless UI

### Vue/Nuxt
- Use scoped styles or Tailwind
- Leverage Composition API for UI logic
- Consider Vuetify, Nuxt UI, or PrimeVue

### Vanilla/Other
- Use CSS custom properties
- Consider utility-first CSS
- Use modern CSS (Grid, :has, container queries)

---

## Anti-Patterns

### Avoid
- Walls of text
- Too many font sizes
- Inconsistent spacing
- Harsh borders everywhere
- No visual hierarchy
- Tiny click targets
- Mystery meat navigation
- Carousels for important content
- Infinite scroll without position indicator
- Modal abuse

### Prefer
- Scannable content
- Systematic typography
- Consistent spacing
- Subtle depth (shadows)
- Clear visual hierarchy
- Generous touch targets
- Clear navigation labels
- Static, scannable layouts
- Pagination with context
- Inline editing where possible

---

## Quick Fixes That Make Big Impact

### Spacing
```css
/* Before: inconsistent */
padding: 10px 15px;
margin: 12px;

/* After: systematic */
padding: var(--spacing-md) var(--spacing-lg);
margin: var(--spacing-md);
```

### Typography
```css
/* Before: cramped */
line-height: 1;
letter-spacing: 0;

/* After: readable */
line-height: 1.5;
letter-spacing: -0.01em;
```

### Transitions
```css
/* Before: none */
.element { /* no transition */ }

/* After: polished */
.element {
  transition: transform 150ms ease, opacity 150ms ease;
}
```
