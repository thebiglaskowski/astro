# Components

> Reusable Astro components for layout, navigation, and content display.

## Patterns

- Every component defines `interface Props` in the frontmatter for type-safe prop passing
- Styles are always scoped within `<style>` blocks — never use global styles here
- CSS uses the Electric Dark custom properties from `global.css` (e.g., `var(--accent-blue)`, `var(--glow-blue)`)
- Interactive behavior uses `<script>` blocks with `document.addEventListener('DOMContentLoaded', ...)`

## Component Reference

| Component | Props | Purpose |
|-----------|-------|---------|
| `BaseHead` | `title`, `description`, `image?` | `<head>` setup: meta tags, OG, Inter font import |
| `Header` | none | Glassmorphic sticky nav, social links (GitHub, X, LinkedIn, YouTube) |
| `Footer` | none | Copyright year, about/blog/contact links, gradient top border |
| `HeaderLink` | `href` + standard `<a>` attrs | Nav link with automatic `.active` class detection, electric blue glow |
| `FormattedDate` | `date: Date` | Renders `<time>` with `en-us` short month format |
| `Gallery` | `images: string[]`, `columns?: number`, `title?`, `alts?: string[]` | GLightbox gallery grid with dark overlay |
| `AutoGallery` | `postSlug`, `galleryName?`, `columns?`, `title?` | Wraps Gallery, auto-discovers images from `public/images/posts/{slug}/{galleryName}/` |

## Gallery System

- `Gallery.astro` initializes GLightbox per gallery instance with unique random IDs
- No client-side dimension resolution needed (GLightbox handles this)
- `AutoGallery.astro` reads the filesystem at build time using `fs.readdirSync` — only works during SSG build
- Supported image formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`
- Default grid: 3 columns, responsive to 2 columns at 768px, 1 column at 480px
- Gallery items have glow hover effects with `--border-glow` color

## Design System

- **Dark-only theme** — no light mode, no theme toggle
- **Font**: Inter Variable (self-hosted via @fontsource-variable/inter)
- **Glassmorphic cards**: `backdrop-filter: blur()`, rgba backgrounds, subtle borders
- **Glow effects**: `--glow-blue` box-shadow on hover states
- **Gradient text**: `.gradient-text` utility class (blue → purple)
- **Gradient accents**: footer border, blog post `<hr>` (blue → purple)
