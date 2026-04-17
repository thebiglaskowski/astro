import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { marked } from 'marked';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';
import { getPublishedPosts } from '../lib/blog';

function stripMdxNoise(body: string): string {
	return body
		.replace(/^import\s+[^;\n]+;?\s*$/gm, '')
		.replace(/<([A-Z]\w*)\b[^>]*\/>/g, '')
		.replace(/<([A-Z]\w*)\b[^>]*>[\s\S]*?<\/\1>/g, '');
}

function sanitizeForRss(html: string, siteUrl: URL): string {
	return html
		.replace(/<img\b[^>]*>/gi, '')
		.replace(/<a\b([^>]*?)href="(\/[^"]+)"/gi, (_, attrs, path) =>
			`<a${attrs}href="${new URL(path, siteUrl).toString()}"`,
		);
}

export async function GET(context: APIContext) {
	const posts = await getPublishedPosts();
	const siteUrl = context.site!;

	const items = await Promise.all(
		posts.map(async (post) => {
			const markdown = stripMdxNoise(post.body ?? '');
			const rawHtml = await marked.parse(markdown);
			const html = sanitizeForRss(rawHtml, siteUrl);
			return {
				title: post.data.title,
				description: post.data.description,
				pubDate: post.data.pubDate,
				link: `/blog/${post.id}/`,
				content: html,
			};
		}),
	);

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: siteUrl,
		items,
	});
}
