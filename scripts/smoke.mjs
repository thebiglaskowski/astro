#!/usr/bin/env node
/**
 * Post-deploy smoke test. Run this after a deploy has landed.
 *
 * Covers the class of failure `npm run audit` structurally cannot: assets that
 * are correct in dist/ and at origin but broken at the edge. The concrete case
 * this exists for — Cloudflare served a page's HTML before its asset upload
 * finished, cached the resulting 404, and pinned it under Astro's one-year
 * `max-age=31536000`. The file was fine everywhere; only the edge was wrong.
 *
 * Diagnostic: a URL that 404s bare but 200s with a cache-buster query is a
 * poisoned cache entry, not a missing file. This script reports that verdict
 * directly so you know whether to purge or to rebuild.
 *
 * Usage: npm run smoke [-- https://other-host]
 */
import { readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = process.argv[2] || 'https://thebiglaskowski.com';

/** Local dist/_astro filenames, when present — lets the report tell "asset was
 *  removed by a later deploy, stale HTML still points at it" apart from "this
 *  build is genuinely broken". Absent (fresh clone, no build) is fine. */
const DIST_ASTRO = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist/_astro');
const localBuild = existsSync(DIST_ASTRO) ? new Set(readdirSync(DIST_ASTRO)) : null;
const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const get = (url, method = 'GET') =>
	fetch(url, { method, headers: { 'user-agent': UA }, redirect: 'follow' });

/** Pages to crawl: the sitemap is authoritative and already lists every route. */
async function pages() {
	const index = await (await get(`${SITE}/sitemap-index.xml`)).text();
	const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	const urls = new Set();
	for (const map of maps) {
		const body = await (await get(map)).text();
		for (const [, loc] of body.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(loc);
	}
	return [...urls];
}

const routes = await pages();
console.log(`  ${routes.length} routes from sitemap`);

const assets = new Set();
for (const route of routes) {
	const res = await get(route);
	if (!res.ok) {
		console.error(`\n✗ page ${res.status}: ${route}`);
		process.exitCode = 1;
		continue;
	}
	const html = await res.text();
	for (const [, url] of html.matchAll(/(?:src|href)="(\/_astro\/[^"]+)"/g)) assets.add(url);
}
console.log(`  ${assets.size} build assets referenced`);

const RETRIES = 3;
const RETRY_DELAY_MS = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Settle gate — do not remove.
 *
 * Probing a bare asset URL while a deploy is still propagating is what CREATES
 * the poisoned entries this script exists to find: origin 404s for a moment,
 * and the edge caches that 404 under `max-age=31536000`. Running the sweep too
 * early does not just report a false alarm, it causes a real one. (Learned the
 * hard way — an early run of this script poisoned two live assets.)
 *
 * So: confirm the deploy has landed using cache-BUSTED probes, which go to
 * origin and can only ever cache under a throwaway unique URL. Only once those
 * pass do we touch the canonical URLs.
 */
const bust = (path) => `${SITE}${path}?cb=${Date.now()}${Math.random()}`;
const sample = [...assets].slice(0, 12);
for (let attempt = 1; attempt <= 10; attempt++) {
	const results = await Promise.all(sample.map((p) => get(bust(p), 'HEAD')));
	const missing = results.filter((r) => !r.ok).length;
	if (missing === 0) {
		console.log('  origin settled — sweeping edge');
		break;
	}
	if (attempt === 10) {
		console.error(
			`\n✗ origin still missing ${missing}/${sample.length} sampled assets after ` +
				`10 tries — deploy looks incomplete. Not sweeping (a sweep now would ` +
				`poison the cache). Re-run once the deploy finishes.\n`,
		);
		process.exit(1);
	}
	console.log(`  origin missing ${missing}/${sample.length} — deploy still landing, waiting 30s`);
	await sleep(RETRY_DELAY_MS);
}

/**
 * Even settled, individual edge nodes can lag — so retry failures before
 * reporting, and only surface what is still failing at the end.
 */
let suspects = [...assets];
let broken = [];

for (let attempt = 1; attempt <= RETRIES; attempt++) {
	broken = [];
	for (const path of suspects) {
		const res = await get(`${SITE}${path}`, 'HEAD');
		if (res.ok) continue;
		const busted = await get(`${SITE}${path}?cb=${Date.now()}${Math.random()}`, 'HEAD');
		broken.push({
			path,
			status: res.status,
			cache: res.headers.get('cf-cache-status') ?? '-',
			age: res.headers.get('age') ?? '-',
			originOk: busted.ok,
		});
	}
	if (broken.length === 0) break;
	suspects = broken.map((b) => b.path);
	if (attempt < RETRIES) {
		console.log(
			`  ${broken.length} asset(s) failing — retry ${attempt}/${RETRIES - 1} ` +
				`in ${RETRY_DELAY_MS / 1000}s (deploys need time to propagate)`,
		);
		await sleep(RETRY_DELAY_MS);
	}
}

/**
 * The discriminator is cf-cache-status, not the cache-buster alone:
 *   HIT  + origin serves it → the edge cached a miss. Purge.
 *   MISS + origin serves it → propagation lag or an edge node behind. Wait.
 *   MISS + origin 404s      → the file really isn't there. Redeploy.
 */
const verdict = (b) => {
	if (b.cache === 'HIT' && b.originOk)
		return (
			'poisoned cache entry — the edge cached a miss while origin serves it.\n' +
			'                 Fix: Cloudflare > Caching > Purge Custom Purge, this URL.'
		);
	if (b.originOk)
		return (
			'origin serves it but the edge does not — most likely still propagating.\n' +
			'                 Re-run in a few minutes before purging anything.'
		);
	if (localBuild && !localBuild.has(b.path.split('/').pop()))
		return (
			'not in the current build — a still-cached HTML page is referencing an\n' +
			'                 asset a later deploy removed. Clears when that page expires;\n' +
			'                 purge the page (not the asset) to clear it now.'
		);
	return 'absent at origin too — redeploy.';
};

if (broken.length === 0) {
	console.log('\n✓ smoke passed — every referenced asset is serving\n');
	process.exit(process.exitCode ?? 0);
}

console.error(`\n✗ smoke failed — ${broken.length} asset(s) not serving\n`);
for (const b of broken) {
	console.error(`  ${b.status}  ${b.path}`);
	console.error(`        cf-cache-status=${b.cache} age=${b.age}`);
	console.error(`        VERDICT: ${verdict(b)}`);
	console.error('');
}
process.exit(1);
