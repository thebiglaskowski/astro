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
const SITE = process.argv[2] || 'https://thebiglaskowski.com';
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

const broken = [];
for (const path of assets) {
	const res = await get(`${SITE}${path}`, 'HEAD');
	if (res.ok) continue;

	// Distinguish a poisoned cache entry from a genuinely missing file.
	const busted = await get(`${SITE}${path}?cb=${Date.now()}${Math.random()}`, 'HEAD');
	broken.push({
		path,
		status: res.status,
		cache: res.headers.get('cf-cache-status') ?? '-',
		age: res.headers.get('age') ?? '-',
		originOk: busted.ok,
	});
}

if (broken.length === 0) {
	console.log('\n✓ smoke passed — every referenced asset is serving\n');
	process.exit(process.exitCode ?? 0);
}

console.error(`\n✗ smoke failed — ${broken.length} asset(s) not serving\n`);
for (const b of broken) {
	console.error(`  ${b.status}  ${b.path}`);
	console.error(`        cf-cache-status=${b.cache} age=${b.age}`);
	console.error(
		b.originOk
			? '        VERDICT: poisoned cache entry — origin serves it fine.\n' +
					'                 Fix: Cloudflare > Caching > Purge Custom Purge, this URL.'
			: '        VERDICT: genuinely absent at origin — redeploy.',
	);
	console.error('');
}
process.exit(1);
