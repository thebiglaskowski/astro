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
│   ├── contact.astro       # Contact form (Formspree-backed)
│   ├── 404.astro           # Custom 404 error page
│   ├── rss.xml.ts          # RSS feed endpoint
│   ├── tags/
│   │   ├── index.astro     # Tag cloud / all tags
│   │   └── [tag].astro     # Posts filtered by tag slug
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
- Post hero/body images stored in `src/assets/images/posts/{YYYY-MM-DD}/` (Astro build-time optimization)
- Gallery images auto-discovered from `src/assets/images/posts/{YYYY-MM-DD}/gallery*/` by `AutoGallery` via `import.meta.glob`
- `AutoGallery` matches on the folder name passed as `postSlug` — by convention this is the `{YYYY-MM-DD}` directory, not the content collection slug

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |
| `npm run audit` | Audit `dist/` — hero ratios, asset existence, link targets, dead links |
| `npm run smoke` | Post-deploy: verify every live asset actually serves (catches edge-cached 404s) |

## Quality Gates

A `pre-push` hook builds and runs `npm run audit`, blocking the push on failure.
Cloudflare deploys straight off a push to `main`, so this is the last automated
check before readers see the site.

**Activate once per clone** (git does not version `.git/hooks`):

```sh
git config core.hooksPath .githooks
```

What the audit enforces:

- **Hero images are 16:9** (within 2%). Heroes render inside `figure.plate`,
  which crops to 16:9 — a non-16:9 source is silently sliced. Pad the source
  rather than loosening the check: replicate the edge row/column when the edge
  is flat (screenshots), or letterbox in the plate mat `#0d0c0e` when it isn't
  (photographic images streak under replication).
- **Every referenced build asset exists**, including `srcset`-only variants.
- **External links carry `target="_blank"` + `rel="noopener"`.** `glightbox`
  anchors are exempt — they are lightbox triggers, and a new tab would bypass
  the overlay.
- **Internal links resolve** to a page that was actually built.

The audit reads `dist/`, not source, because that is the only place the whole
pipeline is observable — rehype plugins have run and `.md`/`.mdx`/raw-HTML all
look alike by then.

**It cannot catch edge-layer failures.** An asset can be correct in `dist/` and
at origin yet still 404 for readers if Cloudflare cached a miss. Run
`npm run smoke` after a deploy lands; it reports whether a failure is a poisoned
cache entry (purge it) or genuinely absent (redeploy).

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
- Frontmatter schema (Zod-validated, see `src/content.config.ts`): `title` (required), `description` (required), `pubDate` (required), `updatedDate?`, `heroImage?`, `tags?: string[]`, `draft?: boolean`
- Drafts filtered via shared `draftFilter()` from `src/lib/blog.ts`
- Post images go in `src/assets/images/posts/{YYYY-MM-DD}/`
- Gallery images auto-discovered from `src/assets/images/posts/{YYYY-MM-DD}/gallery*/` (pass the date folder as `postSlug` to `<AutoGallery>`)
- Tags are free-form strings; URLs are generated via `slugifyTag()` in `src/lib/blog.ts` (e.g. `"Face Swap"` → `/tags/face-swap/`)

### Routing
- Blog listing serves as homepage at `/`
- Blog posts use `[...slug].astro` with `post.id` as the slug
- Blog URLs: `/blog/{post-id}/`

## Key Patterns

- **Page structure**: Every page uses `BaseHead` + `Header` + `<main>` + `Footer` (via `BaseLayout.astro`)
- **Blog queries**: Use `getPublishedPosts()`, `getAllTags()`, `getPostsByTag()`, or `draftFilter()` from `src/lib/blog.ts` — never duplicate query logic
- **Gallery system**: `Gallery.astro` (manual image list) and `AutoGallery.astro` (auto-discovers from `src/assets/images/posts/{YYYY-MM-DD}/{galleryName}/`)
- **Active nav links**: `HeaderLink.astro` compares `Astro.url.pathname` against `href` prop; the `/` link also matches `/blog/*` routes
- **Blog listing**: Posts sorted by `pubDate` descending, first post gets `.featured` class, tag pills shown outside the card anchor so clicks route to the tag
- **Tag pills**: `.tag-pill` utility in `global.css` — reused on homepage cards, post pages, and tag index
- **Analytics**: GA loads only in production and only when `PUBLIC_GA_ID` is set; honors `navigator.doNotTrack`
- **RSS/Sitemap/robots**: Auto-generated (`rss.xml`, `sitemap-index.xml`); `public/robots.txt` points crawlers at the sitemap. Site URL: `https://thebiglaskowski.com`
