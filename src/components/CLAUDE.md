# Components

> Reusable Astro components for layout, navigation, and content display.

## Patterns

- Every component defines `interface Props` in the frontmatter for type-safe prop passing
- Styles are always scoped within `<style>` blocks — never use global styles here
- CSS uses the Noir editorial custom properties from `global.css` (e.g., `var(--oxblood)`, `var(--steel)`, `var(--rule)`, `var(--mute)`, `var(--paper)`) — the old Electric Dark tokens (`--accent-*`, `--glow-*`, `--text-*`, `--bg-*`) no longer exist
- Interactive behavior uses `<script>` blocks with `document.addEventListener('DOMContentLoaded', ...)`

## Component Reference

| Component | Props | Purpose |
|-----------|-------|---------|
| `BaseHead` | `title`, `description`, `image?` | `<head>` setup: meta tags, OG, font preload |
| `Header` | none | Glassmorphic sticky nav, social links (GitHub, X, LinkedIn, YouTube) |
| `Footer` | none | Copyright year, about/blog/contact links, hairline top border |
| `HeaderLink` | `href` + standard `<a>` attrs | Nav link with automatic `.active` class detection, oxblood active underline |
| `FormattedDate` | `date: Date` | Renders `<time>` with `en-us` short month format |
| `Gallery` | `images: string[]`, `columns?: number`, `title?`, `alts?: string[]` | GLightbox gallery grid with dark overlay |
| `AutoGallery` | `postSlug`, `galleryName?`, `columns?`, `title?` | Wraps Gallery, auto-discovers images from `public/images/posts/{slug}/{galleryName}/` |
| `ShareLinks` | `url`, `title` | Social share row (X, LinkedIn, Facebook) with inline SVG icons; opens in new tab |

## Gallery System

- `Gallery.astro` initializes GLightbox per gallery instance with unique random IDs
- No client-side dimension resolution needed (GLightbox handles this)
- `AutoGallery.astro` reads the filesystem at build time using `fs.readdirSync` — only works during SSG build
- Supported image formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Default grid: 3 columns, responsive to 2 columns at 768px, 1 column at 480px
- Gallery items have a subtle scale + drop-shadow hover, with a `--steel` border accent

## Design System

- **Dark-only theme** — Noir editorial (ink, paper, oxblood, steel); no light mode, no theme toggle
- **Fonts**: Newsreader Variable (serif) + IBM Plex Sans Variable (sans), self-hosted via @fontsource-variable
- **Flat, not glassmorphic**: hairline rules (`--rule`), bordered "plate" figures, no blur/glow
- **Hover states**: color/border shift to `--steel`, never glow box-shadows
- **Accent**: `--oxblood` (Prussian blue) for active/emphasis; `--steel` for links/hover
