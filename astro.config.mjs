// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import partytown from '@astrojs/partytown';
import { unified } from '@astrojs/markdown-remark';

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

// https://astro.build/config
export default defineConfig({
    site: 'https://thebiglaskowski.com',
    trailingSlash: 'always',
    markdown: {
        processor: unified({ rehypePlugins: [rehypeFramePostImages] }),
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