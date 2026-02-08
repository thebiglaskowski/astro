# TheBigLaskowski

> Personal blog and portfolio site for Joe Laskowski — AI art, development tutorials, and creative technology exploration. Live at thebiglaskowski.com.

## Quality Philosophy

- Fix every error you encounter, regardless of who introduced it
- Never label issues as "pre-existing" or "out of scope"
- Quality gates must pass with ZERO errors, not "zero new errors"
- The goal is a perfect codebase, not just "didn't make it worse"
- Solve root causes, never apply workarounds or quick fixes
- If you cannot fix something, explain why and propose alternatives — don't dismiss it
- Admit mistakes immediately — "I made a mistake" not "there was an issue"

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Astro 5 | Static site framework (SSG) |
| MDX | Blog posts with embedded components |
| TypeScript (strict) | Type-safe frontmatter, component props |
| PhotoSwipe 5 | Lightbox gallery for image posts |
| @astrojs/sitemap | Auto-generated sitemap |
| @astrojs/rss | RSS feed generation |

## Architecture

```
src/
├── components/       # Reusable Astro components (6 files)
│   ├── BaseHead.astro      # <head> meta, fonts, OG tags, theme flash prevention
│   ├── Header.astro        # Nav, social links, dark/light toggle
│   ├── Footer.astro        # Footer with copyright + links
│   ├── HeaderLink.astro    # Nav link with active state detection
│   ├── FormattedDate.astro # Date formatting helper
│   ├── Gallery.astro       # PhotoSwipe image gallery grid
│   └── AutoGallery.astro   # Auto-discovers images from public/ directory
├── content/
│   └── blog/         # Markdown/MDX blog posts
├── layouts/
│   └── BlogPost.astro      # Blog post layout with hero image + prose
├── pages/
│   ├── index.astro         # Homepage with hero, feature cards, CTA
│   ├── about.astro         # About page with profile + bio
│   ├── rss.xml.js          # RSS feed endpoint
│   └── blog/
│       ├── index.astro     # Blog listing with card grid
│       └── [...slug].astro # Dynamic blog post routes
├── styles/
│   └── global.css          # Monokai theme, CSS custom properties, base styles
├── consts.ts               # SITE_TITLE, SITE_DESCRIPTION
└── content.config.ts       # Blog collection schema (Zod)
public/
├── fonts/            # Atkinson font files (woff)
├── images/           # Post images organized by date slug
│   └── posts/{YYYY-MM-DD}/
│       ├── featured.webp
│       └── gallery/  # Gallery images auto-discovered by AutoGallery
└── *.svg             # Logo, favicon
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |

## Code Standards

### TypeScript
- Strict mode with `strictNullChecks: true`
- Extends `astro/tsconfigs/strict`
- Component props use `interface Props` in frontmatter

### Styling
- **Monokai color theme** via CSS custom properties (`--accent-pink`, `--accent-green`, `--accent-blue`, `--accent-purple`, `--accent-yellow`, `--accent-orange`)
- Dark/light mode via `[data-theme="dark"]` attribute on `<html>`
- Theme persisted in `localStorage.getItem('theme')`
- Flash prevention script in `BaseHead.astro` runs before page render
- All component styles are **scoped** (`<style>` blocks in `.astro` files)
- Global styles only in `src/styles/global.css`
- Responsive breakpoint: `768px` (mobile), `480px` (small mobile)
- Utility classes: `.accent-pink`, `.accent-green`, `.accent-blue`, `.accent-purple`, `.accent-yellow`, `.accent-orange`, `.text-center`, `.text-muted`
- `.container` max-width: `800px`
- `.card` base class for bordered content blocks

### Content
- Blog posts live in `src/content/blog/` as `.md` or `.mdx`
- Frontmatter schema (Zod-validated): `title` (required), `description`, `pubDate`, `updatedDate`, `heroImage`, `featuredImage`, `images`, `slug`, `tags`, `author`, `draft`
- Drafts filtered out in production (`import.meta.env.PROD ? data.draft !== true : true`)
- Post images go in `public/images/posts/{YYYY-MM-DD}/`
- Gallery images auto-discovered from `public/images/posts/{slug}/gallery/`

### Routing
- Blog posts use `[...slug].astro` with `post.id` as the slug
- Blog URLs: `/blog/{post-id}/`

## Key Patterns

- **Page structure**: Every page uses `BaseHead` + `Header` + `<main>` + `Footer`
- **Gallery system**: `Gallery.astro` (manual image list) and `AutoGallery.astro` (auto-discovers from `public/images/posts/{slug}/{galleryName}/`)
- **Active nav links**: `HeaderLink.astro` compares `Astro.url.pathname` against `href` prop
- **Blog listing**: Posts sorted by `pubDate` descending, first post gets `.featured` class
- **RSS/Sitemap**: Auto-generated, site URL: `https://thebiglaskowski.com`
