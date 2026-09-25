# Components

> Reusable Astro components for layout, navigation, and content display.

## Patterns

- Every component defines `interface Props` in the frontmatter for type-safe prop passing
- Styles are always scoped within `<style>` blocks — never use global styles here
- CSS uses the Longform custom properties from `global.css` (e.g., `var(--accent)`, `var(--text)`, `var(--muted)`, `var(--rule)`, `var(--font-ui)`) — the Noir tokens (`--oxblood`, `--steel`, `--paper*`, `--ink`, `--mute`) no longer exist
- Interactive behavior uses `<script>` blocks that initialise on `document.addEventListener('astro:page-load', ...)` — `ClientRouter` swaps pages without a reload, so `DOMContentLoaded` fires only once per session

## Component Reference

| Component | Props | Purpose |
|-----------|-------|---------|
| `BaseHead` | `title`, `description`, `image?` | `<head>` setup: meta tags, OG, font preload |
| `FormattedDate` | `date: Date` | Renders `<time>` with `en-us` short month format |
| `Gallery` | `images: string[]`, `columns?: number`, `title?`, `alts?: string[]` | GLightbox gallery grid with dark overlay |
| `AutoGallery` | `postSlug`, `galleryName?`, `columns?`, `title?` | Wraps Gallery, auto-discovers images from `src/assets/images/posts/{YYYY-MM-DD}/{galleryName}/` |
| `ShareLinks` | `url`, `title` | Social share row (X, LinkedIn, Facebook) with inline SVG icons; opens in new tab |

## Gallery System

- `Gallery.astro` gives each gallery a stable ID (hash of its image paths); `BlogPost.astro` lazy-loads GLightbox on the first click and initialises one instance per gallery ID
- No client-side dimension resolution needed (GLightbox handles this)
- `AutoGallery.astro` discovers images at build time via `import.meta.glob` over `src/assets/images/posts/**/gallery*/`, so they get Astro image optimization
- Supported image formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Default grid: 3 columns, responsive to 2 columns at 768px, 1 column at 480px
- Gallery items have a subtle scale + drop-shadow hover, with an `--accent-bright` border accent

## Design System

- **Dark-only theme** — Longform (ink, paper, brass); no light mode, no theme toggle
- **Fonts**: JetBrains Mono Variable (display + UI) + Source Serif 4 Variable (reading text), self-hosted via @fontsource-variable
- **Hairlines and air**: `--rule` hairlines, 4px-radius images, pill buttons, no glow
- **Hover states**: color/border shift to `--accent`, never glow box-shadows
- **Accent**: `--accent` (brass) for active/emphasis/links, `--accent-bright` for hover
