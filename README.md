# TheBigLaskowski.com

Personal website and blog built with [Astro](https://astro.build).

## Features

- ✅ Fast static site generation with Astro
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap and RSS feed support
- ✅ MDX support for interactive content
- ✅ PhotoSwipe galleries for image collections
- ✅ Responsive design with Monokai theme (dark/light toggle)
- ✅ Social media integration (GitHub, X, LinkedIn, YouTube)
- ✅ Content collections for type-safe frontmatter

## Tech Stack

- **Framework**: Astro 5.x
- **Content**: Markdown/MDX with content collections
- **Galleries**: PhotoSwipe for image lightboxes
- **Styling**: CSS with CSS custom properties (Monokai theme)
- **Deployment**: Static site generation

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
├── public/
├── src/
│   ├── components/
│   ├── content/
│   ├── layouts/
│   └── pages/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at \`localhost:4321\`    |
| `npm run build`           | Build your production site to \`./dist/\`        |
| `npm run preview`         | Preview your build locally, before deploying     |

## Content Management

Blog posts are stored in \`src/content/blog/\` as Markdown and MDX files. The content schema validates frontmatter fields like title, date, and hero images.

For posts with image galleries, use the \`<Gallery>\` component with MDX format to create interactive PhotoSwipe lightboxes.

## About

Personal website for Joe Laskowski featuring AI art, development tutorials, and tech exploration.
