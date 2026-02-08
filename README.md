# TheBigLaskowski.com

> AI art, development tutorials, and creative technology exploration — built fast, styled electric.

Personal website and blog for **Joe Laskowski**, powered by [Astro](https://astro.build) with a custom **Electric Dark** design system featuring glassmorphic cards, gradient accents, and glow effects on a deep space navy canvas.

**Live at [thebiglaskowski.com](https://thebiglaskowski.com)**

---

## Features

- Static site generation — zero JavaScript by default, sub-second page loads
- Electric Dark design system with electric blue / purple gradient accents
- Glassmorphic UI — frosted glass cards with `backdrop-filter` blur
- GLightbox image galleries with dark overlay
- Inter Variable font — self-hosted, no external CDN requests
- SEO-optimized with canonical URLs, OpenGraph, and Twitter cards
- Auto-generated sitemap and RSS feed
- MDX support for interactive blog content
- Content collections with Zod-validated frontmatter
- Fully responsive — mobile-first breakpoints at 768px and 480px
- Accessible — skip links, ARIA labels, focus-visible outlines, reduced-motion support

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| [Astro 5](https://astro.build) | Static site framework (SSG) |
| [MDX](https://mdxjs.com) | Blog posts with embedded components |
| TypeScript (strict) | Type-safe frontmatter and component props |
| [GLightbox](https://biati-digital.github.io/glightbox/) | Lightweight image lightbox (~11KB gzip) |
| [Inter Variable](https://rsms.me/inter/) | Modern variable font via @fontsource |
| [@astrojs/sitemap](https://docs.astro.build/en/guides/integrations-guide/sitemap/) | Auto-generated sitemap |
| [@astrojs/rss](https://docs.astro.build/en/guides/rss/) | RSS feed generation |

## Project Structure

```
src/
├── components/          # Reusable Astro components
│   ├── BaseHead.astro        # <head> meta, fonts, OG tags
│   ├── Header.astro          # Glassmorphic sticky nav + social links
│   ├── Footer.astro          # Footer with gradient border
│   ├── HeaderLink.astro      # Nav link with active state glow
│   ├── FormattedDate.astro   # Date formatting helper
│   ├── Gallery.astro         # GLightbox image gallery grid
│   └── AutoGallery.astro     # Auto-discovers images from public/
├── content/
│   └── blog/                 # Markdown/MDX blog posts
├── layouts/
│   └── BlogPost.astro        # Blog post layout with gradient accents
├── pages/
│   ├── index.astro           # Homepage — gradient hero, glass cards
│   ├── about.astro           # About page with profile + bio
│   ├── rss.xml.js            # RSS feed endpoint
│   └── blog/
│       ├── index.astro       # Blog listing with glow-hover cards
│       └── [...slug].astro   # Dynamic blog post routes
├── styles/
│   └── global.css            # Electric Dark theme + CSS custom properties
└── consts.ts                 # Site title and description
public/
├── fonts/                    # (cleared — fonts now via @fontsource)
├── images/
│   └── posts/{YYYY-MM-DD}/   # Post images organized by date
│       └── gallery/          # Auto-discovered gallery images
└── favicon.svg               # Terminal prompt icon (gradient border)
```

## Commands

| Command | Action |
|---------|--------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server at `localhost:4321` |
| `npm run build` | Production build to `./dist/` |
| `npm run preview` | Preview production build locally |

## Design System

The **Electric Dark** theme uses a single dark palette with electric accents:

```
Backgrounds:  #0a0a0f → #111118 → #161625 → #1a1a2e
Text:         #e2e8f0 (primary) → #94a3b8 → #64748b (muted)
Accents:      #00d4ff (blue) · #a855f7 (purple) · #ec4899 (pink)
              #22c55e (green) · #eab308 (yellow) · #f97316 (orange)
```

Key visual elements:
- **Gradient text** on hero headings (blue → purple)
- **Glassmorphic cards** with `backdrop-filter: blur(10px)` and rgba borders
- **Glow effects** on hover states via blue box-shadow
- **Gradient accents** on footer border and blog post dividers

## Content

Blog posts live in `src/content/blog/` as `.md` or `.mdx` files. Frontmatter is Zod-validated with fields for `title`, `description`, `pubDate`, `heroImage`, `tags`, `draft`, and more.

For posts with image galleries, use the `<AutoGallery>` component in MDX — it auto-discovers images from `public/images/posts/{slug}/gallery/` at build time.

## About

Built by Joe Laskowski in South Bend, Indiana. IT professional by day, AI art explorer and creative technologist by night.
