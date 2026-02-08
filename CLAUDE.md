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
| GLightbox 3 | Lightbox gallery for image posts |
| @fontsource-variable/inter | Self-hosted Inter variable font |
| @astrojs/sitemap | Auto-generated sitemap |
| @astrojs/rss | RSS feed generation |

## Architecture

```
src/
├── components/       # Reusable Astro components
│   ├── BaseHead.astro      # <head> meta, fonts, OG tags
│   ├── Header.astro        # Sticky nav, social links (dark-only theme)
│   ├── Footer.astro        # Footer with copyright + links
│   ├── HeaderLink.astro    # Nav link with active state detection
│   ├── FormattedDate.astro # Date formatting helper
│   ├── SocialIcon.astro    # SVG social media icons
│   ├── Gallery.astro       # GLightbox image gallery grid
│   └── AutoGallery.astro   # Auto-discovers images from src/assets/ directory
├── content/
│   └── blog/         # Markdown/MDX blog posts
├── layouts/
│   └── BlogPost.astro      # Blog post layout with hero image + prose
├── lib/
│   └── blog.ts             # Shared blog query utility (draft filter, sorting)
├── pages/
│   ├── index.astro         # Blog listing (homepage)
│   ├── about.astro         # About page with profile + bio
│   ├── 404.astro           # Custom 404 error page
│   ├── rss.xml.ts          # RSS feed endpoint
│   └── blog/
│       └── [...slug].astro # Dynamic blog post routes
├── styles/
│   └── global.css          # Electric Dark theme, CSS custom properties, base styles
├── consts.ts               # SITE_TITLE, SITE_DESCRIPTION
└── content.config.ts       # Blog collection schema (Zod)
public/
└── *.svg             # Logo, favicon
```

### Image Storage
- Post images stored in `src/assets/images/posts/{YYYY-MM-DD}/` (Astro build-time optimization)
- Gallery images auto-discovered from `src/assets/images/posts/{slug}/gallery/`

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
- All source files are TypeScript (no `.js` files)

### Styling
- **Electric Dark theme** (dark-only, no light mode) via CSS custom properties
- Accent colors: `--accent-pink`, `--accent-green`, `--accent-blue`, `--accent-purple`, `--accent-yellow`, `--accent-orange`
- Design tokens defined in `global.css` `:root`: spacing scale (`--space-*`), border radius (`--radius-*`), transitions (`--transition-*`)
- All component styles are **scoped** (`<style>` blocks in `.astro` files)
- Global styles only in `src/styles/global.css`
- Responsive breakpoints: `768px` (mobile), `480px` (small mobile)
- `.container` max-width: `800px`
- `.card` base class for glassmorphic bordered content blocks

### Content
- Blog posts live in `src/content/blog/` as `.md` or `.mdx`
- Frontmatter schema (Zod-validated): `title` (required), `description`, `pubDate`, `updatedDate`, `heroImage`, `featuredImage`, `images`, `slug`, `tags`, `author`, `draft`
- Drafts filtered via shared `draftFilter()` from `src/lib/blog.ts`
- Post images go in `src/assets/images/posts/{YYYY-MM-DD}/`
- Gallery images auto-discovered from `src/assets/images/posts/{slug}/gallery/`

### Routing
- Blog listing serves as homepage at `/`
- Blog posts use `[...slug].astro` with `post.id` as the slug
- Blog URLs: `/blog/{post-id}/`

## Key Patterns

- **Page structure**: Every page uses `BaseHead` + `Header` + `<main>` + `Footer`
- **Blog queries**: Use `getPublishedPosts()` or `draftFilter()` from `src/lib/blog.ts` — never duplicate query logic
- **Gallery system**: `Gallery.astro` (manual image list) and `AutoGallery.astro` (auto-discovers from `src/assets/images/posts/{slug}/{galleryName}/`)
- **Active nav links**: `HeaderLink.astro` compares `Astro.url.pathname` against `href` prop
- **Blog listing**: Posts sorted by `pubDate` descending, first post gets `.featured` class
- **RSS/Sitemap**: Auto-generated, site URL: `https://thebiglaskowski.com`
