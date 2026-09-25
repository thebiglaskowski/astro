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
| Astro 7 | Static site framework (SSG), `ClientRouter` view transitions |
| MDX | Blog posts with embedded components |
| TypeScript (strict) | Type-safe frontmatter, component props |
| GLightbox 3 | Lightbox gallery for image posts |
| @fontsource-variable/jetbrains-mono + source-serif-4 | Self-hosted mono display/UI + serif reading face |
| Pagefind | Static search index, built after `astro build` |
| three.js | Dead Signal browser game (`src/games/dead-signal/`) |
| @astrojs/sitemap | Auto-generated sitemap |
| @astrojs/rss | RSS feed generation |

## Architecture

```
src/
├── components/       # Reusable Astro components
│   ├── BaseHead.astro      # <head> meta, fonts, OG tags
│   ├── FormattedDate.astro # Date formatting helper
│   ├── ShareLinks.astro    # Social share row on post pages
│   ├── SmokeBackground.astro # Cursor-driven WebGL fluid smoke, homepage feed only
│   ├── Gallery.astro       # GLightbox image gallery grid
│   └── AutoGallery.astro   # Auto-discovers images from src/assets/ directory
├── content/
│   └── blog/         # Markdown/MDX blog posts
├── games/
│   └── dead-signal/        # three.js game modules (rendered by pages/games/dead-signal.astro)
├── layouts/
│   ├── BaseLayout.astro    # Page chrome: sticky header + scroll progress, Pagefind search, footer
│   └── BlogPost.astro      # Post: full-bleed hero, contents rail, prose, up-next, on-demand comments
├── lib/
│   └── blog.ts             # Blog queries (draft filter, sorting, tags, reading time)
├── pages/
│   ├── [...page].astro     # Homepage hero + scroll-and-load feed; /2/, /3/ … archive pages
│   ├── about.astro         # About page with profile + bio
│   ├── resume.astro        # Resume
│   ├── contact.astro       # Contact form (Formspree-backed)
│   ├── 404.astro           # Custom 404 error page
│   ├── rss.xml.ts          # RSS feed endpoint
│   ├── games/
│   │   └── dead-signal.astro # Full-viewport game page (skips BaseLayout)
│   ├── tags/
│   │   ├── index.astro     # Tag cloud / all tags
│   │   └── [tag].astro     # Posts filtered by tag slug
│   └── blog/
│       └── [...slug].astro # Dynamic blog post routes
├── styles/
│   └── global.css          # Longform theme, CSS custom properties, base styles
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

- **Hero images are 16:9** (within 2%). Heroes render in 16:9 `.frame` boxes
  (homepage feed, up-next card, the phone post hero) with `object-fit: cover`
  — a non-16:9 source is silently sliced. Pad the source rather than loosening
  the check: replicate the edge row/column when the edge is flat
  (screenshots), or letterbox in the page ink `#0d0f13` when it isn't
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
- **Longform theme** (dark-only, no light mode): ink, paper, brass — cinematic full-bleed heroes and scroll-driven motion
- Tokens in `global.css` `:root`: `--bg`, `--surface`, `--surface-2`, `--text-bright`, `--text`, `--text-dim`, `--muted`, `--faint`, `--rule`, `--rule-faint`, `--accent` (brass), `--accent-bright`, `--font-display`, `--font-ui`, `--font-text`, `--gutter`, `--header-h`, `--content-max`
- The Noir tokens (`--ink`, `--paper*`, `--oxblood`, `--steel`, `--font-serif`, `--font-sans`) no longer exist
- Fonts: JetBrains Mono Variable (headings + UI, ligatures off in code) + Source Serif 4 Variable (reading text)
- **Scroll-driven motion** (`animation-timeline: scroll()` / `view()`) sits behind `@supports` + `prefers-reduced-motion: no-preference`, so other browsers get the static page. Always write these as longhands (`animation-name`, `-timing-function`, `-fill-mode`, `-timeline`): Vite's lightningcss minifier folds a shorthand + timeline into `animation: … scroll(root)`, which Chromium rejects, and the effect silently disappears in the build
- Shared helpers in `global.css`: `.eyebrow`, `.btn`, `.tag-pill`, `.readlink`, `.ul` (hover underline), `.frame` (16:9 image), `.sk` (skeleton shimmer), `.rise` / `.unveil` / `.parallax` (scroll motion), `.prose`, `.drop-cap`, `.page-shell` + `.page-head` (simple pages)
- All component styles are **scoped** (`<style>` blocks in `.astro` files)
- Global styles only in `src/styles/global.css`
- Responsive breakpoints: `1240px` (timeline rail / figure break-outs drop), `1000px` (post contents rail → `<details>`), `900px` (feed chapters stack), `820px` (two-row header, stacked post hero)
- Post dates are UTC midnight — format with `timeZone: 'UTC'` (see `FormattedDate.astro`) or they print a day early west of UTC

### Content
- Blog posts live in `src/content/blog/` as `.md` or `.mdx`
- Frontmatter schema (Zod-validated, see `src/content.config.ts`): `title` (required), `description` (required), `pubDate` (required), `updatedDate?`, `heroImage?`, `tags?: string[]`, `draft?: boolean`
- Drafts filtered via shared `draftFilter()` from `src/lib/blog.ts`
- Post images go in `src/assets/images/posts/{YYYY-MM-DD}/`
- Gallery images auto-discovered from `src/assets/images/posts/{YYYY-MM-DD}/gallery*/` (pass the date folder as `postSlug` to `<AutoGallery>`)
- Tags are free-form strings; URLs are generated via `slugifyTag()` in `src/lib/blog.ts` (e.g. `"Face Swap"` → `/tags/face-swap/`)

### Routing
- Blog listing serves as homepage at `/` via `[...page].astro` (paginated, 3 per page: `/`, `/2/`, …)
- Blog posts use `[...slug].astro` with `post.id` as the slug
- Blog URLs: `/blog/{post-id}/`

## Key Patterns

- **Page structure**: Every page (except the Dead Signal game) uses `BaseLayout.astro`, which renders `BaseHead`, the sticky header (with a `header-meta` named slot the post page fills with its title + reading ring), search panel and footer
- **Blog queries**: Use `getPublishedPosts()`, `getAllTags()`, `getPostsByTag()`, or `draftFilter()` from `src/lib/blog.ts` — never duplicate query logic
- **Gallery system**: `Gallery.astro` (manual image list) and `AutoGallery.astro` (auto-discovers from `src/assets/images/posts/{YYYY-MM-DD}/{galleryName}/`)
- **Active nav links**: `isActive()` in `BaseLayout.astro` sets `aria-current="page"`; the `/` link also matches `/blog/*` and archive pages (`/2/`…, but not `/404/`)
- **Blog listing (scroll and load)**: posts sorted by `pubDate` descending. Every page renders its chapters into `.feed` plus a `.feed-more` block carrying `data-next`; the homepage script fetches the next page's HTML when `.feed-more` nears the viewport, appends its `.feed` children (dropping a duplicate year divider), and swaps in the fetched `.feed-more`. Without JS the "Load older" link is ordinary pagination
- **Post page**: `[...slug].astro` passes `headings` from `render()`; `BlogPost.astro` builds the contents rail from the `h2`s, picks up-next as the next-older post (the oldest wraps to the newest), and mounts giscus only when the reader presses "Load the conversation" — the custom `public/giscus/longform.css` theme applies on the live domain only, `transparent_dark` elsewhere
- **Search**: Pagefind UI, lazy-loaded from `/pagefind/` when the search toggle is first opened
- **Tag pills**: `.tag-pill` utility in `global.css` — reused on post pages and the tag index
- **Analytics**: GA loads only in production and only when `PUBLIC_GA_ID` is set; honors `navigator.doNotTrack`
- **RSS/Sitemap/robots**: Auto-generated (`rss.xml`, `sitemap-index.xml`); `public/robots.txt` points crawlers at the sitemap, and `public/_redirects` sends `/sitemap.xml` there too. Site URL: `https://thebiglaskowski.com`
- **SEO head**: `BaseLayout`/`BaseHead` take `noindex` (emits `noindex, follow`) and `article` (`og:type=article` + `article:published_time` / `modified_time` / `tag`). Meta descriptions are trimmed to ~155 chars at a word boundary; post `<title>`s get the " — thebiglaskowski" suffix only when the result fits in 60 chars. Tag pages with a single post are `noindex`
- **Sitemap reads the build**: the `@astrojs/sitemap` filter/serialize in `astro.config.mjs` read each built page's HTML — pages with a robots `noindex` meta are dropped, and `lastmod` comes from `article:modified_time`/`published_time`. So a page's own head is the single source of truth for both
- **Fonts**: Source Serif 4 is the weight-axis build (`wght.css`), not `opsz` — the opsz files are ~2.5x larger and create a font instance per size, which measurably slowed first render on mobile
