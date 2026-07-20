// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import partytown from '@astrojs/partytown';
import { unified } from '@astrojs/markdown-remark';

const SITE = 'https://thebiglaskowski.com';

/**
 * Wrap each standalone markdown image (a paragraph whose only content is one
 * `<img>`) in the same editorial "plate" frame the hero image uses: bordered
 * mat, corner brackets, and a caption strip (alt text + figure number).
 *
 * This runs at build time so the frame is server-rendered (no layout shift).
 * It deliberately does NOT add the lightbox <a> wrapper — the runtime script
 * in BlogPost.astro does that using the image's final optimized src, which
 * sidesteps any plugin-ordering ambiguity around the /_astro/ URL.
 *
 * The hero is "Fig. I", so body figures are numbered from II.
 */
function rehypeFramePostImages() {
    const toRoman = (/** @type {number} */ n) => {
        const table = /** @type {[number, string][]} */ ([
            [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
            [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
            [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
        ]);
        let out = '';
        for (const [value, symbol] of table) {
            while (n >= value) { out += symbol; n -= value; }
        }
        return out;
    };

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
        let figure = 1; // hero occupies Fig. I
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
                    el('div', { className: ['plate'] }, [
                        img,
                        el('span', { className: ['corner-bl'] }),
                        el('span', { className: ['corner-br'] }),
                    ]),
                    el('figcaption', { className: ['plate-cap'] }, [
                        el('span', {}, alt ? [{ type: 'text', value: alt }] : []),
                        el('span', {}, [{ type: 'text', value: `Fig. ${toRoman(figure)}` }]),
                    ]),
                ]);
            }
        };
        walk(tree);
    };
}

/**
 * Open external links in markdown/MDX prose in a new tab, matching what the
 * hand-authored components (Header, ShareLinks, about) already do.
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
    markdown: {
        processor: unified({ rehypePlugins: [rehypeFramePostImages, rehypeExternalLinksNewTab] }),
    },
    build: {
        inlineStylesheets: 'always',
    },
    integrations: [
        mdx(),
        sitemap(),
        partytown({
            config: {
                forward: ['dataLayer.push'],
            },
        }),
    ],
});