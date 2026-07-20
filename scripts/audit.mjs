#!/usr/bin/env node
/**
 * Pre-push audit. Runs against dist/ — the built output, not source — because
 * that is the only place the whole pipeline is observable: the rehype plugins
 * have run, Astro has emitted its image variants, and .md/.mdx/raw-HTML all
 * look the same by then.
 *
 * Scope note: this catches in-repo defects only. It cannot see edge-layer
 * failures (a Cloudflare-cached 404 on a file that is correct in dist/ and at
 * origin) — that class is what `npm run smoke` covers, after a deploy lands.
 *
 * Usage: npm run audit   (expects a fresh `npm run build`)
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const HEROES = join(ROOT, 'src/assets/images/posts');

/** Heroes render inside `figure.plate`, which crops to 16:9. A source that is
 *  not 16:9 gets silently sliced — that is the bug this whole file exists for.
 *  2% is loose enough for rounding (a 1479x832 pad lands at 1.7776) and tight
 *  enough to catch a real mis-size (today's break was 7% off). */
const TARGET_RATIO = 16 / 9;
const RATIO_TOLERANCE = 0.02;

const failures = [];
const notes = [];
const fail = (check, detail) => failures.push({ check, detail });

/** Every .html file under dist/, recursively. */
async function htmlFiles(dir) {
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await htmlFiles(p)));
		else if (entry.name.endsWith('.html')) out.push(p);
	}
	return out;
}

/** Hero sources referenced by a post's frontmatter, resolved to disk paths. */
async function heroSources() {
	const posts = join(ROOT, 'src/content/blog');
	const found = [];
	for (const name of await readdir(posts)) {
		const body = await readFile(join(posts, name), 'utf8');
		const m = body.match(/^heroImage:\s*['"](.+?)['"]/m);
		if (!m) continue;
		found.push({ post: name, file: join(HEROES, m[1].replace(/^.*posts\//, '')) });
	}
	return found;
}

// ── 1. Hero aspect ratio ────────────────────────────────────────────────────
for (const { post, file } of await heroSources()) {
	if (!existsSync(file)) {
		fail('hero-missing', `${post} -> ${file.replace(ROOT + '/', '')}`);
		continue;
	}
	const { width, height } = await sharp(file).metadata();
	const ratio = width / height;
	const off = Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO;
	if (off > RATIO_TOLERANCE) {
		const dir = ratio < TARGET_RATIO ? 'too narrow — pad width' : 'too wide — pad height';
		fail(
			'hero-ratio',
			`${post}: ${width}x${height} = ${ratio.toFixed(4)}:1, ` +
				`${(off * 100).toFixed(1)}% off 16:9 (${dir})`,
		);
	}
}

// ── 2–4. Whole-site HTML checks ─────────────────────────────────────────────
if (!existsSync(DIST)) {
	fail('no-dist', 'dist/ not found — run `npm run build` first');
} else {
	const pages = await htmlFiles(DIST);
	notes.push(`${pages.length} pages scanned`);

	const assets = new Set();
	let externalLinks = 0;
	let internalLinks = 0;

	for (const page of pages) {
		const html = await readFile(page, 'utf8');
		const rel = page.replace(DIST + '/', '');

		// 2. Every referenced build asset actually exists on disk.
		//    srcset is parsed too, not just src/href — a responsive variant that
		//    only ever appears in a srcset is exactly as fatal when missing, and
		//    is the harder one to notice by eye.
		const referenced = [
			...[...html.matchAll(/(?:src|href)="(\/_astro\/[^"]+)"/g)].map((m) => m[1]),
			...[...html.matchAll(/srcset="([^"]+)"/g)].flatMap((m) =>
				m[1]
					.split(',')
					.map((c) => c.trim().split(/\s+/)[0])
					.filter((u) => u.startsWith('/_astro/')),
			),
		];
		for (const url of referenced) {
			assets.add(url);
			if (!existsSync(join(DIST, url))) fail('asset-missing', `${rel} -> ${url}`);
		}

		// 3. External links open in a new tab.
		//    glightbox anchors are exempt on purpose: they are lightbox triggers
		//    (YouTube embeds in prose, and the image anchors the runtime script
		//    injects). Sending those to a new tab would bypass the overlay and
		//    navigate the reader away instead.
		for (const [tag, href] of html.matchAll(/<a\s+href="(https?:\/\/[^"]+)"([^>]*)>/g)) {
			if (href.includes('thebiglaskowski.com')) continue; // self-links are internal
			if (/class="[^"]*glightbox/.test(tag)) continue;
			externalLinks++;
			if (!/target="_blank"/.test(tag) || !/rel="[^"]*noopener/.test(tag)) {
				fail('link-target', `${rel} -> ${href}`);
			}
		}

		// 4. Internal links resolve to a page that was actually built.
		for (const [, href] of html.matchAll(/href="(\/[^"#?][^"]*)"/g)) {
			if (href.startsWith('/_astro/') || href.startsWith('/pagefind/')) continue;
			if (/\.(xml|txt|svg|webp|png|jpe?g|ico|json|js|css)$/.test(href)) {
				if (!existsSync(join(DIST, href))) fail('file-missing', `${rel} -> ${href}`);
				continue;
			}
			internalLinks++;
			const target = join(DIST, href, 'index.html');
			if (!existsSync(target)) fail('dead-link', `${rel} -> ${href}`);
		}
	}

	notes.push(`${assets.size} build assets referenced`);
	notes.push(`${externalLinks} external links, ${internalLinks} internal links`);
}

// ── Report ──────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`  ${n}`);

if (failures.length === 0) {
	console.log('\n✓ audit passed\n');
	process.exit(0);
}

console.error(`\n✗ audit failed — ${failures.length} problem(s)\n`);
const byCheck = new Map();
for (const f of failures) {
	if (!byCheck.has(f.check)) byCheck.set(f.check, []);
	byCheck.get(f.check).push(f.detail);
}
for (const [check, details] of byCheck) {
	console.error(`  [${check}]`);
	for (const d of details) console.error(`    ${d}`);
	console.error('');
}
process.exit(1);
