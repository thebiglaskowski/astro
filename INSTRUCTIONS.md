# thebiglaskowski - Site Instructions

## Quick Start

```bash
# Install dependencies
npm install

# Start the dev server (live reload at http://localhost:4321)
npm run dev

# Build for production
npm run build

# Preview the production build locally
npm run preview
```

---

## Writing Blog Posts

### Where Do Posts Go?

All blog posts live in:

```
src/content/blog/
```

Create a new `.md` or `.mdx` file in that directory and it will automatically become a blog post.

### File Formats

- **`.md`** -- Standard Markdown. Use this for straightforward text-and-image posts. This is what you'll use most of the time.
- **`.mdx`** -- MDX (Markdown + JSX). Identical to Markdown but allows you to `import` and use Astro components inline (e.g. image galleries, embedded videos). Only use `.mdx` when you need component functionality inside the post body.

### Frontmatter

Every post must begin with a **frontmatter** block between `---` fences. This is YAML metadata that tells Astro about your post.

```yaml
---
title: 'Your Post Title'
pubDate: 2026-02-09
description: 'A short summary that appears in post listings and SEO meta tags.'
heroImage: '../../assets/images/posts/2026-02-09/featured.webp'
tags:
  - "Tag1"
  - "Tag2"
draft: false
---
```

#### Field Reference

| Field         | Required | Type       | Description                                                                 |
|---------------|----------|------------|-----------------------------------------------------------------------------|
| `title`       | Yes      | string     | The post title displayed on the page and in listings.                       |
| `pubDate`     | Yes      | date       | Publication date in `YYYY-MM-DD` format. Controls sort order.               |
| `description` | Yes      | string     | Short summary for post listings, RSS feed, and SEO meta tags.               |
| `heroImage`   | No       | image path | Large banner image at the top of the post and in post listings.             |
| `tags`        | No       | string[]   | Array of tags for categorization.                                           |
| `updatedDate` | No       | date       | Date the post was last updated. Use `YYYY-MM-DD` format.                    |
| `draft`       | No       | boolean    | Set to `true` to hide the post from the production build. Defaults to `false`. Drafts are still visible during local dev (`npm run dev`). |

### Minimal Post Example

The absolute minimum you need:

```markdown
---
title: 'My New Post'
pubDate: 2026-02-09
description: 'A brief summary of what this post is about.'
---

Your content goes here. Standard Markdown syntax applies.

## Subheading

Paragraphs, **bold**, *italic*, [links](https://example.com), images, code blocks -- all work as expected.
```

### Full Post Example

```markdown
---
title: 'A Complete Example Post'
pubDate: 2026-02-09
updatedDate: 2026-02-10
description: 'This post demonstrates all available frontmatter fields.'
heroImage: '../../assets/images/posts/2026-02-09/featured.webp'
tags:
  - "Tutorial"
  - "Astro"
---

Your Markdown content starts here.
```

---

## Working with Images

### Post Images (Hero)

Store images for each post in a date-based directory under:

```
src/assets/images/posts/YYYY-MM-DD/
```

For example, a post published on 2026-02-09 would have its images in:

```
src/assets/images/posts/2026-02-09/featured.webp
```

Reference them in frontmatter using relative paths from the blog post file:

```yaml
heroImage: '../../assets/images/posts/2026-02-09/featured.webp'
```

Astro processes these images at build time -- it optimizes, resizes, and converts formats automatically. Use `.webp` for best results but `.jpg`, `.png`, and `.gif` all work.

### Inline Images in Post Body

You can embed images in your Markdown body using standard syntax:

```markdown
![Alt text](../../assets/images/posts/2026-02-09/screenshot.webp)
```

Single images in posts are automatically centered and open in a lightbox when clicked. Always use relative paths (`../../assets/...`) so Astro can optimize the images at build time.

### Image Galleries (Requires `.mdx`)

Two gallery components are available. To use them, your post file must be `.mdx` instead of `.md`.

#### Gallery Component

Manually specify which images to display. Import the images and pass them as an array:

```mdx
---
title: 'Post with Gallery'
pubDate: 2026-02-09
description: 'A post demonstrating galleries.'
---

import Gallery from '../../components/Gallery.astro';

Some introductory text...

<Gallery
  images={[
    (await import('../../assets/images/posts/2026-02-09/image1.webp')).default,
    (await import('../../assets/images/posts/2026-02-09/image2.webp')).default,
  ]}
  columns={3}
  title="My Gallery"
  alts={["Description of image 1", "Description of image 2"]}
/>
```

**Props:**
| Prop      | Default | Description                           |
|-----------|---------|---------------------------------------|
| `images`  | --      | Array of imported image objects.      |
| `columns` | `3`     | Number of grid columns.              |
| `title`   | --      | Optional heading above the gallery.  |
| `alts`    | --      | Array of alt-text strings per image. |

#### AutoGallery Component

Automatically loads all images from a named subdirectory. Place images in:

```
src/assets/images/posts/YYYY-MM-DD/gallery/
```

Then use in your `.mdx` post:

```mdx
import AutoGallery from '../../components/AutoGallery.astro';

<AutoGallery postSlug="2026-02-09" columns={3} title="Screenshots" />
```

You can have multiple named galleries per post by creating additional subdirectories (e.g., `gallery2/`, `gallery-before/`) and referencing them with the `galleryName` prop:

```mdx
<AutoGallery postSlug="2026-02-09" galleryName="gallery2" title="More Images" />
```

**Props:**
| Prop          | Default     | Description                                           |
|---------------|-------------|-------------------------------------------------------|
| `postSlug`    | --          | The date-based folder name (e.g. `"2026-02-09"`).    |
| `galleryName` | `"gallery"` | Subdirectory name inside the post's image folder.     |
| `columns`     | `3`         | Number of grid columns.                               |
| `title`       | --          | Optional heading above the gallery.                   |

Gallery images open in a lightbox (GLightbox) when clicked.

---

## Drafts

Set `draft: true` in a post's frontmatter to hide it from the production site:

```yaml
---
title: 'Work in Progress'
pubDate: 2026-02-09
description: 'This post is still being written.'
draft: true
---
```

- **`npm run dev`** -- Drafts ARE visible (so you can preview them locally).
- **`npm run build`** -- Drafts are EXCLUDED from the production output.

This lets you commit unfinished posts without publishing them.

---

## Project Structure Overview

```
astro/
├── public/                  # Static files served as-is (favicons, robots.txt, etc.)
├── src/
│   ├── assets/images/posts/ # Post images organized by date (YYYY-MM-DD/)
│   ├── components/          # Reusable Astro components
│   │   ├── AutoGallery.astro
│   │   ├── Gallery.astro
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   └── ...
│   ├── content/
│   │   └── blog/            # YOUR BLOG POSTS GO HERE
│   ├── layouts/
│   │   ├── BaseLayout.astro # Shared layout for all pages (HTML shell, head, header, footer)
│   │   └── BlogPost.astro   # Layout wrapper for blog posts (extends BaseLayout)
│   ├── lib/
│   │   └── blog.ts          # Helper functions (draft filtering, sorting)
│   ├── pages/               # File-based routing
│   │   ├── index.astro      # Home page
│   │   ├── about.astro      # About page
│   │   ├── contact.astro    # Contact page
│   │   ├── blog/            # Individual post routes
│   │   ├── rss.xml.ts       # RSS feed (auto-generated)
│   │   └── 404.astro        # Custom 404 page
│   ├── styles/              # Global stylesheets
│   ├── consts.ts            # Site-wide constants (title, description)
│   └── content.config.ts    # Content collection schema definition
├── astro.config.mjs         # Astro configuration
└── package.json
```

---

## Common Workflows

### Creating a New Post

1. Create a new `.md` file in `src/content/blog/` (e.g. `my-new-post.md`)
2. Add the frontmatter block with `title`, `pubDate`, and `description`
3. Write your content in Markdown below the frontmatter
4. If you have images, create `src/assets/images/posts/YYYY-MM-DD/` and add them there
5. Run `npm run dev` to preview

### Previewing Locally

```bash
npm run dev
```

Opens at `http://localhost:4321`. The page auto-refreshes as you save changes.

### Building for Production

```bash
npm run build
```

The output goes to the `dist/` directory. To preview the built site locally:

```bash
npm run preview
```

---

## Heading Conventions

Use `##` (h2) for top-level headings within blog post content. The post title is already rendered as `h1` by the layout, so your content should start at `h2` and go deeper as needed (`###`, `####`, etc.). Do not use `#` (h1) in post body content.

---

## Tips

- **URL slugs**: The post URL is determined by the filename. A file named `my-cool-post.md` becomes `/blog/my-cool-post/`.
- **Trailing slashes**: All URLs use trailing slashes (enforced by `trailingSlash: 'always'` in the Astro config).
- **Post ordering**: Posts are sorted by `pubDate` (newest first).
- **RSS feed**: The site auto-generates an RSS feed at `/rss.xml` from published posts.
- **Sitemap**: A sitemap is auto-generated at `/sitemap-index.xml` for SEO.
- **Image optimization**: Astro automatically optimizes images imported from `src/assets/`. Always place images there rather than in `public/` to take advantage of this.
- **Image centering**: Single images in blog posts are automatically centered and wrapped in a lightbox link.
- **Standard Markdown features**: Headings, bold, italic, links, code blocks (with syntax highlighting), blockquotes, lists, tables, and horizontal rules all work as expected.
