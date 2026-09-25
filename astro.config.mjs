// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import partytown from '@astrojs/partytown';
import { unified } from '@astrojs/markdown-remark';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = 'https://thebiglaskowski.com';

/**
 * The sitemap is built after the pages are written, so it can read each
 * page's own head instead of re-deriving page state here: pages that say
 * noindex are left out, and articles report their modified/published date.
 */
const DIST = fileURLToPath(new URL('./dist/', import.meta.url));
const builtHtml = (/** @type {string} */ url) => {
    try {
        return readFileSync(`${DIST}${new URL(url).pathname.replace(/^\//, '')}index.html`, 'utf8');
    } catch {
        return '';
    }
};
const metaContent = (/** @type {string} */ html, /** @type {string} */ property) =>
    html.match(new RegExp(`<meta property="${property}" content="([^"]+)"`))?.[1];

/**
 * Wrap each standalone markdown image (a paragraph whose only content is one
 * `<img>`) in a figure with a caption strip: alt text + a figure number.
 *
 * This runs at build time so the frame is server-rendered (no layout shift).
 * It deliberately does NOT add the lightbox <a> wrapper — the runtime script
 * in BlogPost.astro does that using the image's final optimized src, which
 * sidesteps any plugin-ordering ambiguity around the /_astro/ URL.
 */
function rehypeFramePostImages() {
    const isBlankText = (/** @type {any} */ node) =>
        node.type === 'text' && !node.value.trim();

    // Returns the lone <img> child of a <p>, or null if the paragraph holds
    // anything else (text, multiple images, inline markup).
    const soleImage = (/** @type {any} */ node) => {
        if (node.type !== 'element' || node.tagName !== 'p') return null;
        const kids = node.children.filter((/** @type {any} */ c) => !isBlankText(c));
        return kids.length === 1 && kids[0].tagName === 'img' ? kids[0] : null;
    };

    return (/** @type {any} */ tree) => {
        let figure = 0;
        const walk = (/** @type {any} */ node) => {
            if (!node.children) return;
            for (let i = 0; i < node.children.length; i++) {
                const img = soleImage(node.children[i]);
                if (!img) { walk(node.children[i]); continue; }

                figure++;
                const alt = (img.properties && img.properties.alt) || '';
                const el = (
                    /** @type {string} */ tagName,
                    /** @type {any} */ properties,
                    /** @type {any[]} */ children = [],
                ) => ({ type: 'element', tagName, properties, children });

                node.children[i] = el('figure', { className: ['body-figure'] }, [
                    el('div', { className: ['plate'] }, [img]),
                    el('figcaption', { className: ['plate-cap'] }, [
                        el('span', {}, alt ? [{ type: 'text', value: alt }] : []),
                        el('span', {}, [{ type: 'text', value: `Fig. ${String(figure).padStart(2, '0')}` }]),
                    ]),
                ]);
            }
        };
        walk(tree);
    };
}

/**
 * Open external links in markdown/MDX prose in a new tab, matching what the
 * hand-authored components (BaseLayout, ShareLinks, about) already do.
 *
 * Only off-site http(s) links are touched. Internal links keep default
 * behaviour on purpose — a new tab for same-site navigation is hostile and
 * would bypass the ClientRouter — and so do mailto:, tel: and bare #anchors.
 *
 * Build time rather than a runtime script so the attributes survive the
 * ClientRouter swap without needing to re-run on every navigation.
 */
function rehypeExternalLinksNewTab() {
    const isExternal = (/** @type {string} */ href) => {
        try {
            return new URL(href, SITE).origin !== new URL(SITE).origin;
        } catch {
            return false; // relative, mailto:, tel:, #anchor — all stay put
        }
    };

    return (/** @type {any} */ tree) => {
        const walk = (/** @type {any} */ node) => {
            if (node.type === 'element' && node.tagName === 'a') {
                const href = node.properties && node.properties.href;
                // glightbox anchors are lightbox triggers (YouTube embeds, and
                // the image anchors the runtime script injects) — a new tab
                // would bypass the overlay and navigate the reader away.
                const cls = /** @type {any[]} */ ([]).concat(
                    (node.properties && node.properties.className) || [],
                );
                const isLightbox = cls.includes('glightbox');
                if (typeof href === 'string' && isExternal(href) && !isLightbox) {
                    node.properties.target = '_blank';
                    node.properties.rel = 'noopener noreferrer';
                }
            }
            if (node.children) node.children.forEach(walk);
        };
        walk(tree);
    };
}

// https://astro.build/config
export default defineConfig({
    site: SITE,
    trailingSlash: 'always',
    // Astro 7 defaults to JSX whitespace rules ('jsx'), which drop the space
    // where prose wraps onto a new line before an inline element — "it is\n
    // <strong>X</strong>" renders as "it isX". The pages here are prose-heavy
    // templates, so keep the HTML-aware compression Astro 6 used.
    compressHTML: true,
    markdown: {
        processor: unified({ rehypePlugins: [rehypeFramePostImages, rehypeExternalLinksNewTab] }),
    },
    build: {
        inlineStylesheets: 'always',
    },
    vite: {
        build: {
            // /games/dead-signal/ ships three.js; its core alone is ~550 kB
            // minified (~135 kB gzipped) and only that page loads it. 600 kB
            // clears it while still flagging anything else that balloons.
            chunkSizeWarningLimit: 600,
            rolldownOptions: {
                // Astro 7 emits a `"use astro:head-inject"` marker at the top of
                // the propagated-assets module it generates for each MDX post.
                // Nothing reads it back, so Rolldown dropping it is harmless —
                // silence only that exact directive, not directive warnings at large.
                onLog(level, log, handler) {
                    if (log.code === 'MODULE_LEVEL_DIRECTIVE' && log.message.includes('use astro:head-inject')) return;
                    handler(level, log);
                },
                output: {
                    // Keep three's core and its add-ons (post-processing etc.)
                    // in their own long-cached chunks, apart from game code.
                    // Groups pull in their dependencies, so the core outranks
                    // the add-ons — otherwise it would be swept into their chunk.
                    codeSplitting: {
                        groups: [
                            { name: 'three', test: /node_modules[\\/]three[\\/](?!examples[\\/])/, priority: 2 },
                            { name: 'three-addons', test: /node_modules[\\/]three[\\/]examples[\\/]/, priority: 1 },
                        ],
                    },
                },
            },
        },
    },
    integrations: [
        mdx(),
        sitemap({
            // /games/ is personal and unlinked; noindex pages (thin tag
            // archives) would contradict their own robots meta if listed.
            filter: (page) => !page.includes('/games/') && !/<meta name="robots" content="noindex/.test(builtHtml(page)),
            serialize(item) {
                const html = builtHtml(item.url);
                const lastmod = metaContent(html, 'article:modified_time') ?? metaContent(html, 'article:published_time');
                return lastmod ? { ...item, lastmod } : item;
            },
        }),
        partytown({
            config: {
                forward: ['dataLayer.push'],
            },
        }),
    ],
});