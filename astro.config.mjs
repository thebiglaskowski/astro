// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import astroIcon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
    site: 'https://thebiglaskowski.com',
    integrations: [
        mdx(),
        sitemap(),
        astroIcon(),
    ],
});